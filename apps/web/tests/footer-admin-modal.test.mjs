import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const footerPath = new URL("../src/components/Footer.astro", import.meta.url);
const footerModalPath = new URL(
  "../src/components/public/FooterAdminModal.tsx",
  import.meta.url,
);

test("footer admin modal supports login view and admin backup management view", async () => {
  const [footerSource, modalSource] = await Promise.all([
    readFile(footerPath, "utf8"),
    readFile(footerModalPath, "utf8"),
  ]);

  assert.match(footerSource, /FooterAdminModal/);
  assert.match(footerSource, /client:load/);
  assert.match(footerSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(footerSource, /verifyAccessToken/);
  assert.match(footerSource, /shouldOpenOnLoad=\{shouldOpenAdminLogin\}/);
  assert.match(footerSource, /adminNextPath=\{adminNextPath\}/);
  assert.match(modalSource, /!isAdminViewer \?/);
  assert.match(modalSource, /isAdminViewer \?/);
  assert.match(modalSource, /footer-admin-login-form/);
  assert.match(modalSource, /footer-admin-import-panel/);
  assert.match(modalSource, /footer-admin-backup-download/);
  assert.match(modalSource, /footer-admin-backup-file/);
  assert.match(modalSource, /footer-admin-backup-load/);
  assert.match(modalSource, /\/internal-api\/imports\/backups\/posts\.zip/);
  assert.match(modalSource, /\/internal-api\/imports\/backups\/load/);
  assert.doesNotMatch(footerSource, /<script type="module">/);
  assert.doesNotMatch(modalSource, /Velog 사용자명/);
  assert.doesNotMatch(modalSource, /Snapshot ID/);
});
