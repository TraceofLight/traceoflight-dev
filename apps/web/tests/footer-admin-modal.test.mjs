import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const footerPath = new URL("../src/components/Footer.astro", import.meta.url);

test("footer admin modal supports login view and admin import management view", async () => {
  const source = await readFile(footerPath, "utf8");

  assert.match(source, /id="footer-admin-trigger"/);
  assert.match(source, /id="footer-admin-login-modal"/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /!\s*isAdminViewer && \(/);
  assert.match(source, /isAdminViewer && \(/);
  assert.match(source, /data-admin-viewer=\{isAdminViewer \? "true" : "false"\}/);
  assert.match(source, /id="footer-admin-login-form"/);
  assert.match(source, /id="footer-admin-import-panel"/);
  assert.match(source, /id="footer-admin-import-username"/);
  assert.match(source, /id="footer-admin-import-snapshot-id"/);
  assert.match(source, /id="footer-admin-import-build"/);
  assert.match(source, /id="footer-admin-import-apply"/);
  assert.match(source, /traceoflight\.velog\.import\.snapshot-id/);
  assert.match(source, /\/internal-api\/imports\/snapshots\/velog/);
  assert.match(
    source,
    /\/internal-api\/imports\/snapshots\/\$\{encodeURIComponent\(snapshotId\)\}\/jobs/,
  );
  assert.doesNotMatch(source, /const toggleAdminView =/);
  assert.doesNotMatch(source, /#header-admin-logout/);
});
