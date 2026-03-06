import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const snapshotRoutePath = new URL(
  "../src/pages/internal-api/imports/snapshots/velog.ts",
  import.meta.url,
);
const applyRoutePath = new URL(
  "../src/pages/internal-api/imports/snapshots/[snapshotId]/jobs.ts",
  import.meta.url,
);

test("internal-api import routes proxy snapshot build and apply calls", async () => {
  const [snapshotSource, applySource] = await Promise.all([
    readFile(snapshotRoutePath, "utf8"),
    readFile(applyRoutePath, "utf8"),
  ]);

  assert.match(snapshotSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(snapshotSource, /verifyAccessToken/);
  assert.match(snapshotSource, /export const POST/);
  assert.match(snapshotSource, /requestBackend\(["']\/imports\/snapshots\/velog["']/);
  assert.match(snapshotSource, /Unauthorized/);

  assert.match(applySource, /ADMIN_ACCESS_COOKIE/);
  assert.match(applySource, /verifyAccessToken/);
  assert.match(applySource, /export const POST/);
  assert.match(
    applySource,
    /requestBackend\(\s*`\/imports\/snapshots\/\$\{encodeURIComponent\(snapshotId\)\}\/jobs`/,
  );
  assert.match(applySource, /snapshot id is required/);
  assert.match(applySource, /Unauthorized/);
});
