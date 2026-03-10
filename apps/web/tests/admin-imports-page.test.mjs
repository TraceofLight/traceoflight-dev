import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pagePath = new URL("../src/pages/admin/imports.astro", import.meta.url);
const panelPath = new URL(
  "../src/components/public/AdminImportsPanel.tsx",
  import.meta.url,
);
const pageLibPath = new URL("../src/lib/admin/imports-page.ts", import.meta.url);
const clientLibPath = new URL("../src/lib/admin/imports-client.ts", import.meta.url);

test("admin imports page mounts dedicated backup management panel", async () => {
  const [pageSource, panelSource, pageLibSource, clientLibSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(panelPath, "utf8"),
    readFile(pageLibPath, "utf8"),
    readFile(clientLibPath, "utf8"),
  ]);

  assert.match(pageSource, /ADMIN_IMPORTS_PATH/);
  assert.match(pageSource, /AdminImportsPanel/);
  assert.match(pageSource, /client:load/);
  assert.match(pageSource, /ADMIN_IMPORTS_COPY/);
  assert.match(panelSource, /admin-imports-panel/);
  assert.match(panelSource, /admin-imports-backup-download/);
  assert.match(panelSource, /admin-imports-backup-file/);
  assert.match(panelSource, /admin-imports-backup-load/);
  assert.match(panelSource, /from ["']@\/lib\/admin\/imports-client["']/);
  assert.match(panelSource, /downloadPostsBackupZip/);
  assert.match(panelSource, /restorePostsBackupZip/);
  assert.doesNotMatch(panelSource, /function resolveErrorMessage/);
  assert.doesNotMatch(panelSource, /async function readJsonSafe/);
  assert.match(clientLibSource, /export async function downloadPostsBackupZip/);
  assert.match(clientLibSource, /export async function restorePostsBackupZip/);
  assert.match(clientLibSource, /\/internal-api\/imports\/backups\/posts\.zip/);
  assert.match(clientLibSource, /\/internal-api\/imports\/backups\/load/);
  assert.match(pageLibSource, /export const ADMIN_IMPORTS_PATH = ["']\/admin\/imports["']/);
  assert.doesNotMatch(pageSource, /Lorem ipsum/i);
});
