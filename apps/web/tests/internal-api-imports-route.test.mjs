import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const downloadRoutePath = new URL(
  "../src/pages/internal-api/imports/backups/posts.zip.ts",
  import.meta.url,
);
const loadRoutePath = new URL(
  "../src/pages/internal-api/imports/backups/load.ts",
  import.meta.url,
);

test("internal-api import routes proxy backup download and load calls", async () => {
  const [downloadSource, loadSource] = await Promise.all([
    readFile(downloadRoutePath, "utf8"),
    readFile(loadRoutePath, "utf8"),
  ]);

  assert.match(downloadSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(downloadSource, /verifyAccessToken/);
  assert.match(downloadSource, /export const GET/);
  assert.match(downloadSource, /requestBackend\(["']\/imports\/backups\/posts\.zip["']/);
  assert.match(downloadSource, /Unauthorized/);

  assert.match(loadSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(loadSource, /verifyAccessToken/);
  assert.match(loadSource, /export const POST/);
  assert.match(loadSource, /requestBackend\(["']\/imports\/backups\/load["']/);
  assert.match(loadSource, /file is required/);
  assert.match(loadSource, /Unauthorized/);
});
