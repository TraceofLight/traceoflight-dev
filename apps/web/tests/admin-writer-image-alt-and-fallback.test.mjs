import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const uploadPath = new URL(
  "../src/lib/admin/new-post-page/upload.ts",
  import.meta.url,
);
const rendererCorePath = new URL(
  "../src/lib/markdown-renderer-core.ts",
  import.meta.url,
);

test("writer image upload inserts markdown with empty alt text", async () => {
  const source = await readFile(uploadPath, "utf8");

  assert.match(source, /if \(kind === "image"\) return `!\[\]\(\$\{mediaUrl\}\)`;/);
  assert.doesNotMatch(source, /if \(kind === "image"\) return `!\[\$\{fileName\}\]\(\$\{mediaUrl\}\)`;/);
});

test("markdown renderer suppresses placeholder alt text and adds image fallback copy", async () => {
  const source = await readFile(rendererCorePath, "utf8");

  assert.match(source, /token\.content/);
  assert.match(source, /const alt = isPlaceholderImageAlt\(rawAlt\) \? "" : rawAlt;/);
  assert.match(source, /onerror=/);
  assert.match(source, /이미지를 불러올 수 없습니다\./);
  assert.doesNotMatch(source, /alt="1\.00"/);
});
