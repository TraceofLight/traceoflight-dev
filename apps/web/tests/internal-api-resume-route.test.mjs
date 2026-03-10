import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const uploadRoutePath = new URL(
  "../src/pages/internal-api/resume/upload.ts",
  import.meta.url,
);
const statusRoutePath = new URL(
  "../src/pages/internal-api/resume/status.ts",
  import.meta.url,
);

test("internal-api resume routes provide status and admin-only upload proxy", async () => {
  const [uploadSource, statusSource] = await Promise.all([
    readFile(uploadRoutePath, "utf8"),
    readFile(statusRoutePath, "utf8"),
  ]);

  assert.match(uploadSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(uploadSource, /verifyAccessToken/);
  assert.match(uploadSource, /export const POST/);
  assert.match(uploadSource, /requestBackend\(["']\/resume["']/);
  assert.match(uploadSource, /file is required/);
  assert.match(statusSource, /export const GET/);
  assert.match(statusSource, /requestBackend\(["']\/resume\/status["']/);
});
