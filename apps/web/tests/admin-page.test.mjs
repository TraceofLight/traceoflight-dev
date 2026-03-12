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

test("admin dashboard route is removed and writer back links fall back to public sections", async () => {
  await assert.rejects(access(adminIndexPath));
  const [newWriterSource, editWriterSource] = await Promise.all([
    readFile(newWriterPath, "utf8"),
    readFile(editWriterPath, "utf8"),
  ]);

  assert.match(
    newWriterSource,
    /const fallbackBackHref = initialContentKind === "project" \? "\/projects\/" : "\/blog\/";/,
  );
  assert.match(
    editWriterSource,
    /const fallbackBackHref = initialContentKind === "project" \? "\/projects\/" : "\/blog\/";/,
  );
  assert.match(newWriterSource, /href=\{backHref\}/);
  assert.match(editWriterSource, /href=\{backHref\}/);
  assert.doesNotMatch(newWriterSource, /href="\/admin"/);
  assert.doesNotMatch(editWriterSource, /href="\/admin"/);
});
