import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const footerPath = new URL("../src/components/Footer.astro", import.meta.url);

test("footer uses single-line rights copy with auto year and styled copyright format", async () => {
  const source = await readFile(footerPath, "utf8");

  assert.match(source, /const currentYear = new Date\(\)\.getFullYear\(\);/);
  assert.match(
    source,
    /ⓒ \{currentYear\}\. \{SITE_TITLE\} All rights reserved\./,
  );
  assert.doesNotMatch(source, /\{SITE_DESCRIPTION\}/);
  assert.match(source, /id="footer-admin-trigger"/);
  assert.match(source, /id="footer-admin-login-modal"/);
  assert.match(source, /id="footer-admin-login-form"/);
  assert.match(source, /\/internal-api\/auth\/login/);
  assert.doesNotMatch(source, /href="\/admin"/);
});
