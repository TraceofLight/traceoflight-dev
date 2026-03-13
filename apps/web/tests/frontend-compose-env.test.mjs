import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const composePath = new URL("../docker-compose.yml", import.meta.url);

test("frontend compose reads runtime ports and backend url from env instead of hardcoded values", async () => {
  const source = await readFile(composePath, "utf8");

  assert.match(source, /env_file:\s*\r?\n\s*-\s*\.\/\.env/);
  assert.match(source, /PORT:\s*\$\{PORT\}/);
  assert.match(source, /SITE_URL:\s*\$\{SITE_URL\}/);
  assert.match(source, /CONTENT_PROVIDER:\s*\$\{CONTENT_PROVIDER\}/);
  assert.match(source, /API_BASE_URL:\s*\$\{API_BASE_URL\}/);
  assert.match(source, /-\s*"\$\{PORT\}"/);
  assert.doesNotMatch(source, /PORT:\s*6543/);
  assert.doesNotMatch(source, /traceoflight-api:6654/);
});
