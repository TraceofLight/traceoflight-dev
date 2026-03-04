import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const writerScriptPath = new URL(
  "../src/lib/admin/new-post-page.ts",
  import.meta.url,
);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const rendererPath = new URL(
  "../src/lib/markdown-renderer.ts",
  import.meta.url,
);
const stylePath = new URL("../src/styles/components/blog.css", import.meta.url);

test("writer and blog db share markdown renderer with figure caption output", async () => {
  const [writerSource, blogDbSource, rendererSource] = await Promise.all([
    readFile(writerScriptPath, "utf8"),
    readFile(blogDbPath, "utf8"),
    readFile(rendererPath, "utf8"),
  ]);

  assert.match(writerSource, /createMarkdownRenderer/);
  assert.match(blogDbSource, /createMarkdownRenderer/);
  assert.match(rendererSource, /renderer\.rules\.image/);
  assert.match(rendererSource, /<figure/);
  assert.match(rendererSource, /<figcaption/);
});

test("writer and post content define figcaption styles", async () => {
  const styleSource = await readFile(stylePath, "utf8");

  assert.match(styleSource, /\.writer-preview-content figcaption/);
  assert.match(styleSource, /\.post-content figcaption/);
});
