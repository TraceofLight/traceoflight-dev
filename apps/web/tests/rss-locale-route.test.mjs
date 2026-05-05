import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const appRootPath = fileURLToPath(new URL("..", import.meta.url));
const routeModuleUrl = new URL("../src/pages/[locale]/rss.xml.ts", import.meta.url).href;
const tsxLoaderPath = pathToFileURL(
  fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
).href;

async function invokeRssRoute({ apiBaseUrl, siteUrl, locale }) {
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
          params: { locale: process.env.LOCALE },
          request: new Request(\`\${process.env.SITE_URL}/\${process.env.LOCALE}/rss.xml\`),
        });
        console.log(JSON.stringify({
          status: response.status,
          contentType: response.headers.get("content-type"),
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
        LOCALE: locale,
      },
    },
  );

  return JSON.parse(stdout.trim());
}

function makePost({ id, slug, locale, title, body }) {
  return {
    id,
    slug,
    title,
    excerpt: `excerpt for ${slug}`,
    body_markdown: body,
    cover_image_url: null,
    status: "published",
    visibility: "public",
    locale,
    tags: [],
    published_at: "2026-04-01T00:00:00.000Z",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-02T00:00:00.000Z",
  };
}

function startMockApi(posts) {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/api/v1/web-service/posts") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(posts));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  return server;
}

test("locale-aware RSS feed returns only posts for that locale", async () => {
  const posts = [
    makePost({ id: "1", slug: "ko-only", locale: "ko", title: "KO post", body: "# heading" }),
    makePost({ id: "2", slug: "en-only", locale: "en", title: "EN post", body: "**bold**" }),
    makePost({ id: "3", slug: "ja-only", locale: "ja", title: "JA post", body: "_italic_" }),
  ];
  const server = startMockApi(posts);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const apiBaseUrl = `http://127.0.0.1:${address.port}/api/v1/web-service`;
    const siteUrl = "https://www.traceoflight.dev";

    const enFeed = await invokeRssRoute({ apiBaseUrl, siteUrl, locale: "en" });
    assert.equal(enFeed.status, 200);
    assert.match(enFeed.contentType, /application\/xml/);
    assert.match(enFeed.body, /EN post/);
    assert.doesNotMatch(enFeed.body, /KO post/);
    assert.doesNotMatch(enFeed.body, /JA post/);
    assert.match(enFeed.body, /<link>https:\/\/www\.traceoflight\.dev\/en\/blog\/en-only\/<\/link>/);

    const koFeed = await invokeRssRoute({ apiBaseUrl, siteUrl, locale: "ko" });
    assert.match(koFeed.body, /KO post/);
    assert.doesNotMatch(koFeed.body, /EN post/);
  } finally {
    server.close();
  }
});

test("locale-aware RSS feed includes atom self-link, language tag, and content:encoded for each item", async () => {
  const posts = [
    makePost({
      id: "1",
      slug: "rich",
      locale: "en",
      title: "Rich post",
      body: "## Section\n\nParagraph with [a link](https://example.com).",
    }),
  ];
  const server = startMockApi(posts);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const feed = await invokeRssRoute({
      apiBaseUrl: `http://127.0.0.1:${address.port}/api/v1/web-service`,
      siteUrl: "https://www.traceoflight.dev",
      locale: "en",
    });

    assert.equal(feed.status, 200);
    assert.match(feed.body, /<atom:link[^>]+href="https:\/\/www\.traceoflight\.dev\/en\/rss\.xml"[^>]+rel="self"/);
    assert.match(feed.body, /<language>en<\/language>/);
    assert.match(feed.body, /<lastBuildDate>/);
    assert.match(feed.body, /<content:encoded>/);
    assert.match(feed.body, /Paragraph with/);
    assert.match(feed.body, /xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom"/);
    assert.match(feed.body, /xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/"/);
  } finally {
    server.close();
  }
});

test("invalid locale returns 404 from RSS route", async () => {
  const server = startMockApi([]);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const feed = await invokeRssRoute({
      apiBaseUrl: `http://127.0.0.1:${address.port}/api/v1/web-service`,
      siteUrl: "https://www.traceoflight.dev",
      locale: "fr",
    });

    assert.equal(feed.status, 404);
  } finally {
    server.close();
  }
});
