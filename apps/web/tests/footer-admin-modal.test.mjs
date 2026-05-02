import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const footerPath = new URL("../src/components/Footer.astro", import.meta.url);
const footerModalPath = new URL(
  "../src/components/public/FooterAdminModal.astro",
  import.meta.url,
);

test("footer keeps login modal and routes admin viewers to imports console", async () => {
  const [footerSource, modalSource] = await Promise.all([
    readFile(footerPath, "utf8"),
    readFile(footerModalPath, "utf8"),
  ]);

  assert.match(footerSource, /FooterAdminModal/);
  // FooterAdminModal is now a static Astro component (no React hydration).
  assert.doesNotMatch(footerSource, /<FooterAdminModal[\s\S]*client:idle/);
  assert.match(footerSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(footerSource, /verifyAccessToken/);
  assert.match(footerSource, /shouldOpenOnLoad=\{shouldOpenAdminLogin\}/);
  assert.match(footerSource, /adminNextPath=\{adminNextPath\}/);
  assert.match(footerSource, /ADMIN_IMPORTS_PATH/);
  assert.match(footerSource, /href=\{ADMIN_IMPORTS_PATH\}/);
  assert.match(footerSource, /icon="admin"/);
  assert.doesNotMatch(footerSource, /border-red-200\/80/);
  assert.doesNotMatch(footerSource, />\s*Admin\s*</);
  assert.match(modalSource, /footer-admin-login-form/);
  assert.doesNotMatch(modalSource, /footer-admin-import-panel/);
  assert.doesNotMatch(modalSource, /footer-admin-backup-download/);
  assert.doesNotMatch(modalSource, /footer-admin-backup-file/);
  assert.doesNotMatch(modalSource, /footer-admin-backup-load/);
  assert.doesNotMatch(modalSource, /\/internal-api\/imports\/backups\/posts\.zip/);
  assert.doesNotMatch(modalSource, /\/internal-api\/imports\/backups\/load/);
  assert.doesNotMatch(footerSource, /<script type="module">/);
  assert.doesNotMatch(modalSource, /Velog 사용자명/);
  assert.doesNotMatch(modalSource, /Snapshot ID/);
});
