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

  assert.match(pageSource, /AdminImportsPanel/);
  assert.match(pageSource, /client:load/);
  assert.match(pageSource, /ADMIN_IMPORTS_COPY/);
  assert.match(pageSource, /max-w-6xl/);
  assert.doesNotMatch(pageSource, /text-center/);
  assert.doesNotMatch(pageSource, /ADMIN_IMPORTS_PATH/);
  assert.match(panelSource, /admin-imports-panel/);
  assert.match(panelSource, /admin-imports-backup-download/);
  assert.match(panelSource, /admin-imports-backup-file/);
  assert.match(panelSource, /admin-imports-backup-load/);
  assert.match(panelSource, /현재 상태 저장/);
  assert.match(panelSource, /백업 ZIP으로 복원/);
  assert.match(panelSource, /복원 전 체크/);
  assert.match(panelSource, /ZIP 파일 선택/);
  assert.match(panelSource, /선택된 파일이 없습니다/);
  assert.match(panelSource, /from ["']@\/lib\/admin\/imports-client["']/);
  assert.match(panelSource, /downloadPostsBackupZip/);
  assert.match(panelSource, /restorePostsBackupZip/);
  assert.match(panelSource, /self-start/);
  assert.match(panelSource, /hover:-translate-y-0\.5/);
  assert.doesNotMatch(panelSource, /function resolveErrorMessage/);
  assert.doesNotMatch(panelSource, /async function readJsonSafe/);
  assert.match(clientLibSource, /export async function downloadPostsBackupZip/);
  assert.match(clientLibSource, /export async function restorePostsBackupZip/);
  assert.match(clientLibSource, /\/internal-api\/imports\/backups\/posts\.zip/);
  assert.match(clientLibSource, /\/internal-api\/imports\/backups\/load/);
  assert.match(pageLibSource, /export const ADMIN_IMPORTS_PATH = ["']\/admin\/imports["']/);
  assert.doesNotMatch(pageSource, /Lorem ipsum/i);
});
