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
const adminImportsPanelPath = new URL(
  "../src/components/public/AdminImportsPanel.tsx",
  import.meta.url,
);
const importsProxyPath = new URL(
  "../src/lib/server/imports-proxy.ts",
  import.meta.url,
);
const projectDetailPath = new URL("../src/pages/projects/[slug].astro", import.meta.url);

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
    adminImportsPanelSource,
    importsProxySource,
    projectDetailSource,
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
    readFile(adminImportsPanelPath, "utf8"),
    readFile(importsProxyPath, "utf8"),
    readFile(projectDetailPath, "utf8"),
  ]);

  assert.match(pageTransitionsSource, /ClientRouter/);
  assert.doesNotMatch(pageTransitionsSource, /ViewTransitions/);
  // GA4 gtag.js is now injected dynamically from an inline bootstrap script
  // (idle callback for LCP-friendly load) instead of a static
  // <script is:inline async src=...> tag.
  assert.match(
    baseHeadSource,
    /script\.src\s*=\s*['"]https:\/\/www\.googletagmanager\.com\/gtag\/js/,
  );
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
  assert.doesNotMatch(adminImportsPanelSource, /MutableRefObject/);
  assert.doesNotMatch(adminImportsPanelSource, /GithubIcon/);
  assert.match(adminImportsPanelSource, /assets\/icons\/footer\/github\.svg\?raw/);
  assert.match(importsProxySource, /export async function proxyTextResponse/);
  assert.match(importsProxySource, /export async function proxyBinaryResponse/);
  assert.doesNotMatch(projectDetailSource, /const relatedSeries =/);
});
