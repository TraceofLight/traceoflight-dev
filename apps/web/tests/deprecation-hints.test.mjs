import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pageTransitionsPath = new URL(
  "../src/components/PageTransitions.astro",
  import.meta.url,
);
const baseHeadPath = new URL("../src/components/BaseHead.astro", import.meta.url);
const footerAdminModalPath = new URL(
  "../src/components/public/FooterAdminModal.tsx",
  import.meta.url,
);
const dialogPath = new URL("../src/components/ui/dialog.tsx", import.meta.url);
const alertDialogPath = new URL(
  "../src/components/ui/alert-dialog.tsx",
  import.meta.url,
);
const selectPath = new URL("../src/components/ui/select.tsx", import.meta.url);
const sheetPath = new URL("../src/components/ui/sheet.tsx", import.meta.url);
const labelPath = new URL("../src/components/ui/label.tsx", import.meta.url);
const separatorPath = new URL(
  "../src/components/ui/separator.tsx",
  import.meta.url,
);
const editorBridgePath = new URL(
  "../src/lib/admin/new-post-page/editor-bridge.ts",
  import.meta.url,
);
const linkNormalizationPath = new URL(
  "../src/lib/admin/new-post-page/link-normalization.ts",
  import.meta.url,
);

test("deprecated Astro and React type patterns are removed from the UI layer", async () => {
  const [
    pageTransitionsSource,
    baseHeadSource,
    footerAdminModalSource,
    dialogSource,
    alertDialogSource,
    selectSource,
    sheetSource,
    labelSource,
    separatorSource,
    editorBridgeSource,
    linkNormalizationSource,
  ] = await Promise.all([
    readFile(pageTransitionsPath, "utf8"),
    readFile(baseHeadPath, "utf8"),
    readFile(footerAdminModalPath, "utf8"),
    readFile(dialogPath, "utf8"),
    readFile(alertDialogPath, "utf8"),
    readFile(selectPath, "utf8"),
    readFile(sheetPath, "utf8"),
    readFile(labelPath, "utf8"),
    readFile(separatorPath, "utf8"),
    readFile(editorBridgePath, "utf8"),
    readFile(linkNormalizationPath, "utf8"),
  ]);

  assert.match(pageTransitionsSource, /ClientRouter/);
  assert.doesNotMatch(pageTransitionsSource, /ViewTransitions/);
  assert.match(baseHeadSource, /<script is:inline async src=/);
  assert.doesNotMatch(footerAdminModalSource, /type FormEvent/);
  assert.doesNotMatch(footerAdminModalSource, /FormEventHandler/);

  for (const source of [
    dialogSource,
    alertDialogSource,
    selectSource,
    sheetSource,
    labelSource,
    separatorSource,
  ]) {
    assert.match(source, /React\.ComponentRef</);
    assert.doesNotMatch(source, /React\.ElementRef</);
  }

  assert.doesNotMatch(editorBridgeSource, /return await markdown;/);
  assert.doesNotMatch(linkNormalizationSource, /\(full, prefix, rawUrl, suffix\)/);
});
