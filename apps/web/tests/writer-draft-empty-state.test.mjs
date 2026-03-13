import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const draftStylesPath = new URL("../src/styles/components/writer/layers.css", import.meta.url);
const draftHelpersPath = new URL("../src/lib/admin/new-post-page/drafts.ts", import.meta.url);

test("writer draft empty state keeps the empty message centered without stretching the panel", async () => {
  const [stylesSource, helpersSource] = await Promise.all([
    readFile(draftStylesPath, "utf8"),
    readFile(draftHelpersPath, "utf8"),
  ]);

  assert.match(helpersSource, /writer-draft-empty/);
  assert.match(stylesSource, /\.writer-draft-empty \{/);
  assert.match(stylesSource, /text-align: center;/);
  assert.doesNotMatch(stylesSource, /min-height: 180px;/);
  assert.doesNotMatch(stylesSource, /align-content: center;/);
  assert.match(stylesSource, /\.writer-draft-feedback:empty \{/);
  assert.match(stylesSource, /display: none;/);
});
