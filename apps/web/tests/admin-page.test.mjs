import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  const editorSectionPath = new URL(
    "../src/components/admin/post-form/EditorSection.astro",
    import.meta.url,
  );
  const [adminIndexSource, newWriterSource, editWriterSource, editorSectionSource] =
    await Promise.all([
      readFile(adminIndexPath, "utf8"),
      readFile(newWriterPath, "utf8"),
      readFile(editWriterPath, "utf8"),
      readFile(editorSectionPath, "utf8"),
    ]);

  assert.match(adminIndexSource, /import AdminImportsPanel from "\.\.\/\.\.\/components\/public\/AdminImportsPanel";/);
  assert.match(adminIndexSource, /<AdminImportsPanel/);
  assert.doesNotMatch(adminIndexSource, /href="\/admin"/);
  assert.match(
    newWriterSource,
    /const fallbackBackHref = initialContentKind === "project" \? "\/projects\/" : "\/blog\/";/,
  );
  assert.match(
    editWriterSource,
    /const fallbackBackHref = initialContentKind === "project" \? "\/projects\/" : "\/blog\/";/,
  );
  // The back link now lives inside the shared EditorSection component which
  // both the new and edit pages render.
  assert.match(newWriterSource, /backHref=\{backHref\}|href=\{backHref\}/);
  assert.match(editWriterSource, /backHref=\{backHref\}|href=\{backHref\}/);
  assert.match(editorSectionSource, /href=\{backHref\}/);
  assert.doesNotMatch(adminIndexSource, /href="\/admin"/);
  assert.doesNotMatch(editorSectionSource, /href="\/admin"/);
});
