import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const domPath = new URL(
  "../src/lib/admin/new-post-page/dom.ts",
  import.meta.url,
);
const typesPath = new URL(
  "../src/lib/admin/new-post-page/types.ts",
  import.meta.url,
);
const submitPath = new URL(
  "../src/lib/admin/new-post-page/submit.ts",
  import.meta.url,
);
const scriptPath = new URL(
  "../src/lib/admin/new-post-page.ts",
  import.meta.url,
);
const postsApiPath = new URL(
  "../src/lib/admin/new-post-page/posts-api.ts",
  import.meta.url,
);

test("admin writer page keeps tag input and chip list inside publish settings", async () => {
  const dialogLayersPath = new URL(
    "../src/components/admin/post-form/DialogLayers.astro",
    import.meta.url,
  );
  const metaPanelPath = new URL(
    "../src/components/admin/post-form/MetaPanel.astro",
    import.meta.url,
  );
  const [dialogLayersSource, metaPanelSource] = await Promise.all([
    readFile(dialogLayersPath, "utf8"),
    readFile(metaPanelPath, "utf8"),
  ]);

  // The meta panel only has the content kind / visibility / series fields.
  assert.notEqual(metaPanelSource.indexOf('id="writer-meta-panel"'), -1);
  assert.equal(metaPanelSource.indexOf('id="post-tags"'), -1);
  assert.equal(metaPanelSource.indexOf('id="writer-tag-chip-list"'), -1);

  // Tags belong to the publish dialog inside DialogLayers.
  const publishLayerStart = dialogLayersSource.indexOf('id="writer-publish-layer"');
  const tagInputIndex = dialogLayersSource.indexOf('id="post-tags"');
  const tagChipIndex = dialogLayersSource.indexOf('id="writer-tag-chip-list"');
  const metaChipRailIndex = dialogLayersSource.indexOf('id="writer-meta-chip-rail"');

  assert.notEqual(publishLayerStart, -1);
  assert.ok(tagInputIndex > publishLayerStart);
  assert.ok(tagChipIndex > publishLayerStart);
  assert.ok(metaChipRailIndex > publishLayerStart);
});

test("admin writer dom/query definitions include tag elements", async () => {
  const source = await readFile(domPath, "utf8");

  assert.match(source, /tagInput: HTMLInputElement/);
  assert.match(source, /tagChipList: HTMLElement/);
  assert.match(source, /metaChipRail: HTMLElement/);
  assert.match(source, /#post-tags/);
  assert.match(source, /#writer-tag-chip-list/);
  assert.match(source, /#writer-meta-chip-rail/);
});

test("admin writer payload model includes tags", async () => {
  const [typesSource, submitSource] = await Promise.all([
    readFile(typesPath, "utf8"),
    readFile(submitPath, "utf8"),
  ]);

  assert.match(typesSource, /tags: string\[]/);
  assert.match(submitSource, /tags,\s*/);
});

test("admin writer script loads tags from internal api and syncs chips", async () => {
  const [source, postsApiSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(postsApiPath, "utf8"),
  ]);

  assert.match(source, /new-post-page\/tags/);
  assert.match(source, /renderMetadataChipRail/);
  assert.match(source, /syncTagInputState/);
  assert.match(postsApiSource, /\/internal-api\/tags/);
});
