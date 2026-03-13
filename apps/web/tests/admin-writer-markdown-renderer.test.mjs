import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { readCssModule } from "./helpers/read-css-module.mjs";

const writerScriptPath = new URL(
  "../src/lib/admin/new-post-page.ts",
  import.meta.url,
);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const rendererPath = new URL(
  "../src/lib/markdown-renderer.ts",
  import.meta.url,
);
const rendererCorePath = new URL(
  "../src/lib/markdown-renderer-core.ts",
  import.meta.url,
);
const lazyRendererPath = new URL(
  "../src/lib/markdown-renderer-lazy.ts",
  import.meta.url,
);
const blogLayoutPath = new URL(
  "../src/layouts/BlogPost.astro",
  import.meta.url,
);
const writerStylePath = new URL(
  "../src/styles/components/writer.css",
  import.meta.url,
);

test("writer and blog db share markdown renderer with figure caption output", async () => {
  const [writerSource, blogDbSource, rendererSource, rendererCoreSource, lazyRendererSource] =
    await Promise.all([
      readFile(writerScriptPath, "utf8"),
      readFile(blogDbPath, "utf8"),
      readFile(rendererPath, "utf8"),
      readFile(rendererCorePath, "utf8"),
      readFile(lazyRendererPath, "utf8"),
    ]);

  assert.match(writerSource, /loadMarkdownRenderer/);
  assert.match(blogDbSource, /createMarkdownRenderer/);
  assert.match(rendererSource, /import MarkdownIt from ["']markdown-it["'];/);
  assert.match(rendererSource, /import hljs from ["']highlight\.js["'];/);
  assert.match(lazyRendererSource, /export async function loadMarkdownRenderer/);
  assert.match(lazyRendererSource, /import\(["']markdown-it["']\)/);
  assert.match(lazyRendererSource, /import\(["']highlight\.js\/lib\/core["']\)/);
  assert.match(lazyRendererSource, /registerLanguage/);
  assert.match(rendererCoreSource, /highlight:\s*\(code,\s*language\)\s*=>/);
  assert.match(
    rendererCoreSource,
    /hljs\.highlight\(code,\s*\{\s*language:\s*normalizedLanguage\s*\}\)/,
  );
  assert.match(rendererCoreSource, /hljs\.highlightAuto\(code\)/);
  assert.match(rendererCoreSource, /renderer\.rules\.image/);
  assert.match(rendererCoreSource, /<figure/);
  assert.match(rendererCoreSource, /<figcaption/);
  assert.match(writerSource, /markdownPreviewPromise/);
  assert.match(
    writerSource,
    /syncCompactViewForViewport\(\);\s*queuePreviewRefresh\(\);\s*return true;/,
  );
});

test("writer preview figcaption style is isolated from blog styles", async () => {
  const [blogLayoutSource, writerStyleSource] = await Promise.all([
    readFile(blogLayoutPath, "utf8"),
    readCssModule(writerStylePath),
  ]);

  assert.match(blogLayoutSource, /\[\&_figcaption\]:text-muted-foreground/);
  assert.doesNotMatch(blogLayoutSource, /\[\&_pre_code\]:text-sky-300/);
  assert.doesNotMatch(blogLayoutSource, /\.writer-preview-content figcaption/);
  assert.match(writerStyleSource, /\.writer-preview-content figcaption/);
});

test("shared markdown renderer supports explicit youtube directives", async () => {
  const [rendererCoreSource, blogLayoutSource] = await Promise.all([
    readFile(rendererCorePath, "utf8"),
    readFile(blogLayoutPath, "utf8"),
  ]);

  assert.match(rendererCoreSource, /youtube/i);
  assert.match(rendererCoreSource, /:::youtube/);
  assert.match(rendererCoreSource, /iframe/);
  assert.match(rendererCoreSource, /youtube-nocookie\.com\/embed/);
  assert.match(rendererCoreSource, /md-video-embed/);
  assert.match(blogLayoutSource, /\[\&_\.md-video-embed\]:/);
  assert.match(blogLayoutSource, /\[\&_iframe\]:/);
});
