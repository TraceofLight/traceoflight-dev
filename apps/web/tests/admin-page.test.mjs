import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const adminIndexPath = new URL(
  "../src/pages/admin/index.astro",
  import.meta.url,
);
const newWriterPath = new URL(
  "../src/pages/admin/posts/new.astro",
  import.meta.url,
);
const editWriterPath = new URL(
  "../src/pages/admin/posts/[slug]/edit.astro",
  import.meta.url,
);

test("admin dashboard route is removed and writer back links return to blog", async () => {
  await assert.rejects(access(adminIndexPath));
  const [newWriterSource, editWriterSource] = await Promise.all([
    readFile(newWriterPath, "utf8"),
    readFile(editWriterPath, "utf8"),
  ]);

  assert.match(newWriterSource, /href="\/blog\/"/);
  assert.match(editWriterSource, /href="\/blog\/"/);
  assert.doesNotMatch(newWriterSource, /href="\/admin"/);
  assert.doesNotMatch(editWriterSource, /href="\/admin"/);
});
