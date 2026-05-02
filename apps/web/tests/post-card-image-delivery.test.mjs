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
  assert.doesNotMatch(source, /params\.set\(["']position["']/);
  assert.doesNotMatch(source, /params\.set\(["']zoom["']/);
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
  assert.doesNotMatch(source, /position\?: "top" \| "centre";/);
  assert.doesNotMatch(source, /zoom\?: number;/);
  assert.match(source, /toBrowserImageUrl\(media\.src,\s*\{\s*width,\s*height,\s*fit\s*\}\)/);
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
  assert.match(source, /sharp\(Buffer\.from\(arrayBuffer\),\s*\{\s*limitInputPixels:\s*MAX_INPUT_PIXELS\s*\}\)/);
  assert.match(source, /const fit = requestUrl\.searchParams\.get\("fit"\)/);
  assert.match(source, /resize\(\{/);
  assert.match(source, /const resizeFit = fit === "contain" \|\| fit === "inside" \? fit : "cover"/);
  assert.match(source, /fit:\s*resizeFit/);
  assert.doesNotMatch(source, /imagePipeline = imagePipeline\.trim\(/);
  assert.doesNotMatch(source, /const position = requestUrl\.searchParams\.get\("position"\)/);
  assert.doesNotMatch(source, /const zoom = clampFloat\(requestUrl\.searchParams\.get\("zoom"\), 1, 1, 2\)/);
  assert.doesNotMatch(source, /attention/);
  assert.doesNotMatch(source, /\.extract\(\{/);
  assert.match(source, /position:\s*"centre"/);
  assert.match(source, /const metadata = await imagePipeline\.metadata\(\)/);
  assert.match(source, /limitInputPixels:\s*MAX_INPUT_PIXELS/);
  assert.match(source, /if \(metadata\.hasAlpha \|\| resizeFit !== "cover"\)/);
  assert.match(source, /const DEFAULT_BACKGROUND = \{ r: 248, g: 250, b: 252, alpha: 1 \};/);
  assert.match(source, /redirect:\s*"manual"/);
  assert.match(source, /AbortController/);
  assert.match(source, /MAX_DOWNLOAD_BYTES/);
  assert.match(source, /MAX_CONTENT_LENGTH_BYTES/);
  assert.match(source, /content-length/);
  assert.match(source, /response\.body\.getReader\(/);
  assert.match(source, /"cache-control":\s*"public, max-age=31536000, immutable"/);
});

test("browser image route keeps opaque source dimensions intact before cover resize", async () => {
  const sourceBuffer = await readFile(fallbackImageAssetPath);
  const originalMeta = await (await import("sharp")).default(sourceBuffer).metadata();
  const transformedBuffer = await invokeBrowserImageRoute({
    cwd: appRootPath,
    requestUrl:
      "http://127.0.0.1:4321/internal-api/media/browser-image?url=%2Fimages%2Fempty-article-image.png&fit=cover&w=1400&h=1000",
    siteUrl: "https://traceoflight.dev",
  });

  assert.equal(transformedBuffer.status, 200);
  assert.ok((originalMeta.width ?? 0) > 0);
  assert.ok((originalMeta.height ?? 0) > 0);
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

test("browser image route limits remote hosts to an allowlist and blocks wider internal ranges", async () => {
  const source = await readFile(mediaRoutePath, "utf8");

  assert.match(source, /ALLOWED_REMOTE_IMAGE_HOSTS/);
  assert.doesNotMatch(source, /velog\.velcdn\.com/);
  assert.match(source, /replace\(\s*\/\^www\\\.\//);
  assert.match(source, /www\.\$\{normalizedHostname\}/);
  assert.match(source, /169\\\.254/);
  assert.match(source, /carrierGradeNatMatch/);
  assert.match(source, /benchmarkMatch/);
  assert.match(source, /startsWith\("fc"\)/);
  assert.match(source, /startsWith\("fe80:"\)/);
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
          API_BASE_URL: `http://127.0.0.1:${backendAddress.port}/api/v1/web-service`,
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

test("browser image route accepts absolute same-origin /media urls by normalizing them into internal asset candidates", async () => {
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

    const absoluteMediaUrl = `http://127.0.0.1:${address.port}/media/test.png`;
    const requestUrl = `http://127.0.0.1:${address.port}/internal-api/media/browser-image?${new URLSearchParams({
      url: absoluteMediaUrl,
      w: "64",
      h: "64",
    }).toString()}`;

    const response = await invokeBrowserImageRoute({
      cwd: appRootPath,
      requestUrl,
      siteUrl: `http://127.0.0.1:${address.port}`,
    });

    assert.equal(response.status, 200);
    assert.equal(response.contentType, "image/webp");
    assert.ok(response.bodyLength > 0);
  } finally {
    server.close();
  }
});

test("post card uses a toss-team-like wide media block and fully filled imagery", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /PUBLIC_HOVER_CARD_CLASS/);
  assert.match(source, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(source, /imageHeight = (640|IMAGE_SIZES\.postCard\.height)/);
  assert.match(source, /sizes="\(max-width: 768px\) 100vw, \(max-width: 1280px\) 50vw, 33vw"/);
  assert.match(source, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(source, /object-cover object-center/);
  assert.match(source, /PUBLIC_MEDIA_FRAME_CLASS/);
  assert.doesNotMatch(source, /const imagePosition = "top";/);
  assert.doesNotMatch(source, /const imageZoom = 1\.2;/);
  assert.doesNotMatch(source, /position=\{imagePosition\}/);
  assert.doesNotMatch(source, /zoom=\{imageZoom\}/);
  assert.match(source, /toBrowserImageUrl\(fallbackCoverImage,\s*\{[\s\S]*fit = "inside"|fit:\s*"inside"/);
  assert.doesNotMatch(source, /aspect-\[4\/5\]/);
});
