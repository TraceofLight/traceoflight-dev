import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);

test("blog db helpers pin backend requests to blog content kind", async () => {
  const source = await readFile(blogDbPath, "utf8");

  assert.match(source, /params = new URLSearchParams\(\{[\s\S]*content_kind:\s*'blog'/);
  assert.match(source, /new URLSearchParams\(\{[\s\S]*status:\s*'published'[\s\S]*content_kind:\s*'blog'/);
  assert.match(source, /const params = new URLSearchParams\(\{ status: 'published', content_kind: 'blog' \}\);/);
});
