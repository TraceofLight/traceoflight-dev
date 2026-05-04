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
      },
    },
  );

  return JSON.parse(stdout.trim());
}

test("runtime sitemap includes public detail urls from db-backed content", async () => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/api/v1/web-service/posts") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([
        {
          id: "post-1",
          slug: "seo-check",
          title: "SEO check",
          excerpt: "site metadata",
          body_markdown: "body",
          cover_image_url: null,
          status: "published",
          visibility: "public",
          tags: [],
          published_at: "2026-03-26T18:02:12.158Z",
          created_at: "2026-03-26T18:02:12.158Z",
          updated_at: "2026-03-27T05:10:00.000Z",
        },
      ]));
      return;
    }

    if (requestUrl.pathname === "/api/v1/web-service/projects") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([
        {
          id: "project-1",
          slug: "render-pipeline",
          title: "Render Pipeline",
          excerpt: "graphics",
          body_markdown: "body",
          cover_image_url: null,
          top_media_kind: "image",
          top_media_image_url: null,
          top_media_youtube_url: null,
          top_media_video_url: null,
          series_title: null,
          content_kind: "project",
          tags: [],
          project_profile: {
            period_label: "2026.03",
            role_summary: "dev",
            project_intro: "intro",
            card_image_url: "",
            highlights_json: [],
            resource_links_json: [],
          },
          related_series_posts: [],
        },
      ]));
      return;
    }

    if (requestUrl.pathname === "/api/v1/web-service/series") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([
        {
          id: "series-1",
          slug: "graphics-notes",
          title: "Graphics Notes",
          description: "series desc",
          cover_image_url: null,
          post_count: 3,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-27T04:00:00.000Z",
        },
      ]));
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

    const response = await invokeSitemapRoute({
      apiBaseUrl: `http://127.0.0.1:${address.port}/api/v1/web-service`,
      siteUrl: "https://www.traceoflight.dev",
    });

    assert.equal(response.status, 200);
    assert.equal(response.contentType, "application/xml; charset=utf-8");
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/<\/loc>/);
    // blog index is emitted for every supported locale (the index pages
    // exist regardless of how many translated post rows have been written)
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/ko\/blog\/<\/loc>/);
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/en\/blog\/<\/loc>/);
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/ja\/blog\/<\/loc>/);
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/zh\/blog\/<\/loc>/);
    // a blog post is emitted only at its actual stored locale; we don't
    // advertise translated URLs that don't exist as real DB rows yet
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/ko\/blog\/seo-check\/<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/en\/blog\/seo-check\/<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/ja\/blog\/seo-check\/<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/zh\/blog\/seo-check\/<\/loc>/);
    // xhtml:link alternates are emitted on index entries (which all exist)
    assert.match(response.body, /xhtml:link rel="alternate"/);
    assert.match(response.body, /hreflang="x-default"/);
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/projects\/render-pipeline<\/loc>/);
    assert.match(response.body, /<loc>https:\/\/www\.traceoflight\.dev\/series\/graphics-notes<\/loc>/);
    assert.match(response.body, /<lastmod>2026-03-27T05:10:00.000Z<\/lastmod>/);
    assert.doesNotMatch(response.body, /<loc>https:\/\/traceoflight\.dev\//);
  } finally {
    server.close();
  }
});
