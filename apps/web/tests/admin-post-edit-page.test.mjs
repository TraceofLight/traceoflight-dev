import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const editPagePath = new URL(
  "../src/pages/admin/posts/[slug]/edit.astro",
  import.meta.url,
);
const newPagePath = new URL("../src/pages/admin/posts/new.astro", import.meta.url);

test("admin post edit page bootstraps writer in edit mode", async () => {
  const titleInputPath = new URL(
    "../src/components/admin/post-form/TitleInput.astro",
    import.meta.url,
  );
  const previewSectionPath = new URL(
    "../src/components/admin/post-form/PreviewSection.astro",
    import.meta.url,
  );
  const [source, titleInputSource, previewSectionSource] = await Promise.all([
    readFile(editPagePath, "utf8"),
    readFile(titleInputPath, "utf8"),
    readFile(previewSectionPath, "utf8"),
  ]);

  assert.doesNotMatch(source, /METADATA/);
  assert.match(source, /requestBackend\(`\/posts\/\$\{encodeURIComponent\(slug\)\}`\)/);
  assert.match(source, /normalizeAdminPostPayload\(await response\.json\(\)\)/);
  assert.match(source, /data-writer-mode=["']edit["']/);
  assert.match(source, /data-edit-slug=\{slug\}/);
  // Initial title is now wired through the shared TitleInput component.
  assert.match(source, /initialTitle=\{initialTitle\}/);
  assert.match(titleInputSource, /value=\{titleValueAttr\}/);
  // The project-only meta hide rules now live in the PreviewSection
  // component (and in MetaPanel for the meta panel itself).
  assert.match(previewSectionSource, /hidden=\{initialContentKind !== "project"\}/);
  assert.match(source, /id="writer-initial-payload"/);
  assert.match(source, /<script[\s\S]*is:inline[\s\S]*id="writer-initial-payload"/);
  assert.match(source, /type="application\/json"/);
  assert.match(source, /JSON\.stringify\(initialPayload\)/);
  assert.match(source, /Astro\.request\.headers\.get\(["']referer["']\)/);
  assert.match(source, /const fallbackBackHref = initialContentKind === "project" \? "\/projects\/" : "\/blog\/"/);
  assert.match(source, /backHref=\{backHref\}/);
  assert.doesNotMatch(source, /href="\/blog\/"/);
  assert.doesNotMatch(source, /initNewPostAdminPage\(\{/);
});

test("admin new writer page keeps create mode bootstrap", async () => {
  const metaPanelPath = new URL(
    "../src/components/admin/post-form/MetaPanel.astro",
    import.meta.url,
  );
  const [source, metaPanelSource] = await Promise.all([
    readFile(newPagePath, "utf8"),
    readFile(metaPanelPath, "utf8"),
  ]);

  assert.doesNotMatch(source, /METADATA/);
  assert.match(source, /data-writer-mode=["']create["']/);
  assert.match(source, /Astro\.url\.searchParams\.get\(["']content_kind["']\)/);
  assert.match(source, /data-initial-content-kind=\{initialContentKind\}/);
  // The meta panel and project fields markup now lives in MetaPanel.
  assert.match(
    metaPanelSource,
    /id="writer-meta-panel"[\s\S]*data-content-kind=\{initialContentKind\}/,
  );
  assert.match(
    metaPanelSource,
    /id="writer-project-fields"[\s\S]*hidden=\{initialContentKind !== "project"\}/,
  );
  assert.match(source, /id="writer-initial-payload"/);
  assert.match(source, /<script id="writer-initial-payload" is:inline type="application\/json">null<\/script>/);
  assert.match(source, />null<\/script>/);
  assert.match(source, /Astro\.request\.headers\.get\(["']referer["']\)/);
  assert.match(source, /const fallbackBackHref = initialContentKind === "project" \? "\/projects\/" : "\/blog\/"/);
  assert.match(source, /backHref=\{backHref\}/);
  assert.doesNotMatch(source, /href="\/blog\/"/);
  assert.doesNotMatch(source, /initNewPostAdminPage\(\{/);
});
