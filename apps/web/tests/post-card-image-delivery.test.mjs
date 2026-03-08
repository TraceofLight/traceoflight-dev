import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const coverMediaLibPath = new URL("../src/lib/cover-media.ts", import.meta.url);
const coverMediaComponentPath = new URL(
  "../src/components/CoverMediaImage.astro",
  import.meta.url,
);
const mediaRoutePath = new URL(
  "../src/pages/internal-api/media/browser-image.ts",
  import.meta.url,
);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);
const repoRootPath = fileURLToPath(new URL("../../..", import.meta.url));
const appRootPath = fileURLToPath(new URL("..", import.meta.url));
const routeModuleUrl = new URL(
  "../src/pages/internal-api/media/browser-image.ts",
  import.meta.url,
).href;
const fallbackImageAssetPath = new URL(
  "../public/images/empty-article-image.png",
  import.meta.url,
);
const tsxLoaderPath = pathToFileURL(
  fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
).href;

async function invokeBrowserImageRoute({ cwd, requestUrl, siteUrl }) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--import",
      tsxLoaderPath,
      "--input-type=module",
      "-e",
      `
        const { GET } = await import(process.env.ROUTE_MODULE_URL);
        const response = await GET({ request: new Request(process.env.REQUEST_URL) });
        const body = Buffer.from(await response.arrayBuffer());
        console.log(JSON.stringify({
          status: response.status,
          contentType: response.headers.get("content-type"),
          bodyLength: body.length,
        }));
      `,
    ],
    {
      cwd,
      env: {
        ...process.env,
        REQUEST_URL: requestUrl,
        ROUTE_MODULE_URL: routeModuleUrl,
        SITE_URL: siteUrl,
      },
    },
  );

  return JSON.parse(stdout.trim());
}

test("cover media lib exposes a browser-sized URL helper for native images", async () => {
  const source = await readFile(coverMediaLibPath, "utf8");

  assert.match(source, /export function toBrowserImageUrl\(/);
  assert.match(source, /new URLSearchParams\(/);
  assert.match(source, /pathname:\s*["']\/internal-api\/media\/browser-image["']/);
  assert.match(source, /params\.set\(["']w["']/);
  assert.match(source, /params\.set\(["']h["']/);
  assert.match(source, /params\.set\(["']position["']/);
  assert.match(source, /params\.set\(["']zoom["']/);
});

test("cover media component routes native images through the browser cache endpoint", async () => {
  const source = await readFile(coverMediaComponentPath, "utf8");

  assert.match(
    source,
    /import \{[\s\S]*buildImageFallbackOnError[\s\S]*toBrowserImageUrl[\s\S]*type CoverMedia[\s\S]*\} from "\.\.\/lib\/cover-media";/,
  );
  assert.match(source, /const browserSizedSrc =/);
  assert.match(source, /const nativeFallbackOnError =/);
  assert.match(source, /toBrowserImageUrl\(media\.src,\s*\{/);
  assert.match(source, /position\?: "top" \| "centre";/);
  assert.match(source, /zoom\?: number;/);
  assert.match(source, /toBrowserImageUrl\(media\.src,\s*\{\s*width,\s*height,\s*position,\s*zoom\s*\}\)/);
  assert.match(source, /onerror=\{nativeFallbackOnError\}/);
  assert.match(source, /decoding="async"/);
  assert.match(source, /width=\{width\}/);
  assert.match(source, /height=\{height\}/);
});

test("browser image route resizes remote originals with cache headers", async () => {
  const source = await readFile(mediaRoutePath, "utf8");

  assert.match(source, /import sharp from ["']sharp["'];/);
  assert.match(source, /export const GET: APIRoute/);
  assert.match(source, /fetch\(sourceUrl/);
  assert.match(source, /sharp\(Buffer\.from\(arrayBuffer\)\)/);
  assert.match(source, /\.trim\(/);
  assert.match(source, /const fit = requestUrl\.searchParams\.get\("fit"\)/);
  assert.match(source, /const position = requestUrl\.searchParams\.get\("position"\)/);
  assert.match(source, /const zoom = clampFloat\(requestUrl\.searchParams\.get\("zoom"\), 1, 1, 2\)/);
  assert.match(source, /resize\(\{/);
  assert.match(source, /const resizeFit = fit === "contain" \|\| fit === "inside" \? fit : "cover"/);
  assert.match(source, /fit:\s*resizeFit/);
  assert.match(source, /const isPlaceholderImage = sourceParam\?\.trim\(\)\.startsWith\("\/images\/empty-"\) \?\? false;/);
  assert.match(source, /const resizePosition = position === "top"/);
  assert.match(source, /\? "top"/);
  assert.match(source, /resizeFit === "cover" && !isPlaceholderImage/);
  assert.match(source, /"attention"/);
  assert.match(source, /"centre"/);
  assert.match(source, /position:\s*resizePosition/);
  assert.match(source, /if \(resizeFit === "cover" && zoom > 1\)/);
  assert.match(source, /const zoomedWidth = Math\.max\(width, Math\.round\(width \* zoom\)\)/);
  assert.match(source, /const zoomedHeight = Math\.max\(height, Math\.round\(height \* zoom\)\)/);
  assert.match(source, /\.extract\(\{/);
  assert.match(source, /const metadata = await imagePipeline\.metadata\(\)/);
  assert.match(source, /if \(metadata\.hasAlpha \|\| resizeFit !== "cover"\)/);
  assert.match(source, /const DEFAULT_BACKGROUND = \{ r: 248, g: 250, b: 252, alpha: 1 \};/);
  assert.match(source, /"cache-control":\s*"public, max-age=31536000, immutable"/);
});

test("browser image route can load fallback assets even when the process starts from the repo root", async () => {
  const response = await invokeBrowserImageRoute({
    cwd: repoRootPath,
    requestUrl:
      "http://127.0.0.1:4321/internal-api/media/browser-image?url=%2Fimages%2Fempty-article-image.png&w=64&h=64",
    siteUrl: "https://traceoflight.dev",
  });

  assert.equal(response.status, 200);
  assert.equal(response.contentType, "image/webp");
  assert.ok(response.bodyLength > 0);
});

test("browser image route checks both the app root and its parent for built fallback assets", async () => {
  const source = await readFile(mediaRoutePath, "utf8");

  assert.match(source, /const MODULE_ROOT =/);
  assert.match(source, /const APP_ROOT_CANDIDATES = \[MODULE_ROOT, path\.dirname\(MODULE_ROOT\)\];/);
  assert.match(source, /for \(const appRoot of APP_ROOT_CANDIDATES\)/);
});

test("browser image route prefers the current request origin for /media assets before SITE_URL fallback", async () => {
  const servedImageBuffer = await readFile(fallbackImageAssetPath);
  const server = createServer((request, response) => {
    if (request.url === "/media/test.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(servedImageBuffer);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    const response = await invokeBrowserImageRoute({
      cwd: appRootPath,
      requestUrl: `http://127.0.0.1:${address.port}/internal-api/media/browser-image?url=%2Fmedia%2Ftest.png&w=64&h=64`,
      siteUrl: "https://traceoflight.dev",
    });

    assert.equal(response.status, 200);
    assert.equal(response.contentType, "image/webp");
    assert.ok(response.bodyLength > 0);
  } finally {
    server.close();
  }
});

test("browser image route falls back to the backend asset origin for /media assets when the site origin does not serve them", async () => {
  const servedImageBuffer = await readFile(fallbackImageAssetPath);
  const backendServer = createServer((request, response) => {
    if (request.url === "/media/test.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(servedImageBuffer);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  const siteServer = createServer((_request, response) => {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  await Promise.all([
    new Promise((resolve) => backendServer.listen(0, "127.0.0.1", resolve)),
    new Promise((resolve) => siteServer.listen(0, "127.0.0.1", resolve)),
  ]);

  try {
    const backendAddress = backendServer.address();
    const siteAddress = siteServer.address();
    assert.notEqual(backendAddress, null);
    assert.notEqual(siteAddress, null);
    assert.equal(typeof backendAddress, "object");
    assert.equal(typeof siteAddress, "object");

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        tsxLoaderPath,
        "--input-type=module",
        "-e",
        `
          const { GET } = await import(process.env.ROUTE_MODULE_URL);
          const response = await GET({ request: new Request(process.env.REQUEST_URL) });
          const body = Buffer.from(await response.arrayBuffer());
          console.log(JSON.stringify({
            status: response.status,
            contentType: response.headers.get("content-type"),
            bodyLength: body.length,
          }));
        `,
      ],
      {
        cwd: appRootPath,
        env: {
          ...process.env,
          REQUEST_URL: `http://127.0.0.1:${siteAddress.port}/internal-api/media/browser-image?url=%2Fmedia%2Ftest.png&w=64&h=64`,
          ROUTE_MODULE_URL: routeModuleUrl,
          SITE_URL: `http://127.0.0.1:${siteAddress.port}`,
          API_BASE_URL: `http://127.0.0.1:${backendAddress.port}/api/v1`,
        },
      },
    );

    const response = JSON.parse(stdout.trim());
    assert.equal(response.status, 200);
    assert.equal(response.contentType, "image/webp");
    assert.ok(response.bodyLength > 0);
  } finally {
    backendServer.close();
    siteServer.close();
  }
});

test("post card uses a toss-team-like wide media block and fully filled imagery", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(
    source,
    /rounded-\[2rem\] border border-white\/80 bg-white\/95 p-3 shadow-\[0_28px_80px_rgba\(15,23,42,0\.10\)\]/,
  );
  assert.match(source, /const mediaFrameClass = "relative h-56 overflow-hidden rounded-\[1\.5rem\] bg-slate-100 sm:h-64";/);
  assert.match(source, /imageHeight = 640/);
  assert.match(source, /sizes="\(max-width: 768px\) 100vw, \(max-width: 1280px\) 50vw, 33vw"/);
  assert.match(source, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(source, /object-cover object-center/);
  assert.match(source, /overflow-hidden rounded-\[1\.5rem\]/);
  assert.match(source, /const imagePosition = "top";/);
  assert.match(source, /const imageZoom = 1\.2;/);
  assert.match(source, /position=\{imagePosition\}/);
  assert.match(source, /zoom=\{imageZoom\}/);
  assert.match(source, /toBrowserImageUrl\(fallbackCoverImage,\s*\{[\s\S]*fit = "cover"|fit:\s*"cover"/);
  assert.doesNotMatch(source, /aspect-\[4\/5\]/);
});
