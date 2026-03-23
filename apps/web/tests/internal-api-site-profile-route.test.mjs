import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const siteProfileRoutePath = new URL(
  "../src/pages/internal-api/site-profile.ts",
  import.meta.url,
);

test("internal-api site profile route proxies admin-authenticated footer contact updates", async () => {
  const source = await readFile(siteProfileRoutePath, "utf8");

  assert.match(source, /export const PUT/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /requestBackend\(["']\/site-profile["']/);
  assert.match(source, /email and githubUrl are required/);
  assert.match(source, /github_url: githubUrl/);
});
