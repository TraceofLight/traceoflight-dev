import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const composePath = new URL("../../../infra/docker/web/docker-compose.yml", import.meta.url);

// This test reaches outside `apps/web/` to validate infra config. The Jenkins
// frontend test image only copies `apps/web/`, so the file isn't present
// there. From a full-repo runner (local dev, full-repo CI) it runs as a
// regression guard; in scoped-image CI it skips with a clear note.
test("frontend compose reads runtime ports and backend url from env instead of hardcoded values", async (t) => {
  let source;
  try {
    source = await readFile(composePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      t.skip("infra/docker/web/docker-compose.yml not in scope (apps/web-only test image)");
      return;
    }
    throw err;
  }

  assert.match(source, /env_file:\s*\r?\n\s*-\s*\.\.\/\.\.\/\.\.\/apps\/web\/\.env\.web/);
  assert.match(source, /PORT:\s*\$\{PORT\}/);
  assert.match(source, /SITE_URL:\s*\$\{SITE_URL\}/);
  assert.match(source, /API_BASE_URL:\s*\$\{API_BASE_URL\}/);
  assert.match(source, /-\s*"\$\{PORT\}"/);
  assert.doesNotMatch(source, /PORT:\s*6543/);
  assert.doesNotMatch(source, /traceoflight-api:6654/);
});
