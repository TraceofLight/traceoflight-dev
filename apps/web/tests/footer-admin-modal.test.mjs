import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const footerPath = new URL("../src/components/Footer.astro", import.meta.url);

test("footer admin modal supports login view and admin import management view", async () => {
  const source = await readFile(footerPath, "utf8");

  assert.match(source, /id="footer-admin-trigger"/);
  assert.match(source, /id="footer-admin-login-modal"/);
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
  assert.match(source, /toggleAdminView\(/);
  assert.doesNotMatch(source, /if \(isAdminViewer\) \{[\s\S]*return;/);
});
