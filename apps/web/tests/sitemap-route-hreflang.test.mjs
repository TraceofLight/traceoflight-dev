import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const appRootPath = fileURLToPath(new URL("..", import.meta.url));
const routeModuleUrl = new URL("../src/pages/sitemap.xml.ts", import.meta.url).href;
const tsxLoaderPath = pathToFileURL(
  fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
).href;

async function invokeSitemapRoute({ apiBaseUrl, siteUrl }) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--import",
      tsxLoaderPath,
      "--input-type=module",
      "-e",
      `
        const { GET } = await import(process.env.ROUTE_MODULE_URL);
        const response = await GET({
          site: new URL(process.env.SITE_URL),
          request: new Request(\`\${process.env.SITE_URL}/sitemap.xml\`),
        });
        console.log(JSON.stringify({
          status: response.status,
          body: await response.text(),
        }));
      `,
    ],
    {
      cwd: appRootPath,
      env: {
        ...process.env,
        API_BASE_URL: apiBaseUrl,
        ROUTE_MODULE_URL: routeModuleUrl,
        SITE_URL: siteUrl,
      },
    },
  );

  return JSON.parse(stdout.trim());
}

function makePost({ id, slug, locale, group }) {
  return {
    id,
    slug,
    title: slug,
    excerpt: "x",
    body_markdown: "x",
    cover_image_url: null,
    status: "published",
    visibility: "public",
    locale,
    translation_group_id: group,
    tags: [],
    published_at: "2026-03-26T00:00:00.000Z",
    created_at: "2026-03-26T00:00:00.000Z",
    updated_at: "2026-03-27T00:00:00.000Z",
  };
}

test("posts sharing a translation_group_id emit hreflang alternates for each sibling locale", async () => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/api/v1/web-service/posts") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([
        makePost({ id: "p1", slug: "intro-ko", locale: "ko", group: "g1" }),
        makePost({ id: "p2", slug: "intro-en", locale: "en", group: "g1" }),
        makePost({ id: "p3", slug: "intro-ja", locale: "ja", group: "g1" }),
        makePost({ id: "p4", slug: "intro-zh", locale: "zh", group: "g1" }),
        makePost({ id: "p5", slug: "solo", locale: "ko", group: "g2" }),
      ]));
      return;
    }
    if (
      requestUrl.pathname === "/api/v1/web-service/projects" ||
      requestUrl.pathname === "/api/v1/web-service/series"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const { status, body } = await invokeSitemapRoute({
      apiBaseUrl: `http://127.0.0.1:${address.port}/api/v1/web-service`,
      siteUrl: "https://www.traceoflight.dev",
    });

    assert.equal(status, 200);

    // Each grouped post URL emits 4 sibling alternates + x-default pointing at ko.
    const koUrl = "https://www.traceoflight.dev/ko/blog/intro-ko/";
    const enUrl = "https://www.traceoflight.dev/en/blog/intro-en/";
    const jaUrl = "https://www.traceoflight.dev/ja/blog/intro-ja/";
    const zhUrl = "https://www.traceoflight.dev/zh/blog/intro-zh/";

    for (const ownUrl of [koUrl, enUrl, jaUrl, zhUrl]) {
      const block = extractUrlBlock(body, ownUrl);
      assert.ok(block, `expected url block for ${ownUrl}`);
      assert.match(block, new RegExp(`hreflang="ko" href="${escapeRegex(koUrl)}"`));
      assert.match(block, new RegExp(`hreflang="en" href="${escapeRegex(enUrl)}"`));
      assert.match(block, new RegExp(`hreflang="ja" href="${escapeRegex(jaUrl)}"`));
      assert.match(block, new RegExp(`hreflang="zh" href="${escapeRegex(zhUrl)}"`));
      assert.match(block, new RegExp(`hreflang="x-default" href="${escapeRegex(koUrl)}"`));
    }

    // Solo post (only one row in its group) has no alternates.
    const soloUrl = "https://www.traceoflight.dev/ko/blog/solo/";
    const soloBlock = extractUrlBlock(body, soloUrl);
    assert.ok(soloBlock, `expected url block for ${soloUrl}`);
    assert.doesNotMatch(soloBlock, /xhtml:link rel="alternate"/);
  } finally {
    server.close();
  }
});

test("posts without a translation_group_id stay alternate-free", async () => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/api/v1/web-service/posts") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([
        // Two posts with the same slug-ish but no group: must NOT cross-link.
        makePost({ id: "a", slug: "post-a", locale: "ko", group: undefined }),
        makePost({ id: "b", slug: "post-a", locale: "en", group: undefined }),
      ]));
      return;
    }
    if (
      requestUrl.pathname === "/api/v1/web-service/projects" ||
      requestUrl.pathname === "/api/v1/web-service/series"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const { body } = await invokeSitemapRoute({
      apiBaseUrl: `http://127.0.0.1:${address.port}/api/v1/web-service`,
      siteUrl: "https://www.traceoflight.dev",
    });

    const koBlock = extractUrlBlock(body, "https://www.traceoflight.dev/ko/blog/post-a/");
    const enBlock = extractUrlBlock(body, "https://www.traceoflight.dev/en/blog/post-a/");
    assert.ok(koBlock && enBlock);
    assert.doesNotMatch(koBlock, /xhtml:link rel="alternate"/);
    assert.doesNotMatch(enBlock, /xhtml:link rel="alternate"/);
  } finally {
    server.close();
  }
});

function extractUrlBlock(xml, locUrl) {
  const escaped = escapeRegex(locUrl);
  const pattern = new RegExp(`<url><loc>${escaped}</loc>[\\s\\S]*?</url>`);
  const match = xml.match(pattern);
  return match ? match[0] : null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
