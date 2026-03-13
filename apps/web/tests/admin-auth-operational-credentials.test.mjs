import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const adminAuthPath = new URL("../src/lib/admin-auth.ts", import.meta.url);
const loginRoutePath = new URL("../src/pages/internal-api/auth/login.ts", import.meta.url);
const refreshRoutePath = new URL("../src/pages/internal-api/auth/refresh.ts", import.meta.url);
const adminImportsPanelPath = new URL(
  "../src/components/public/AdminImportsPanel.tsx",
  import.meta.url,
);

test("admin auth integrates backend operational credentials and revision-aware session checks", async () => {
  const [adminAuthSource, loginRouteSource, refreshRouteSource] = await Promise.all([
    readFile(adminAuthPath, "utf8"),
    readFile(loginRoutePath, "utf8"),
    readFile(refreshRoutePath, "utf8"),
  ]);

  assert.match(adminAuthSource, /credentialRevision/);
  assert.match(adminAuthSource, /verifyOperationalAdminCredentials/);
  assert.match(adminAuthSource, /requestBackendPublic\('\/admin\/auth\/login'/);
  assert.match(adminAuthSource, /requestBackendPublic\('\/admin\/auth\/refresh'/);
  assert.match(adminAuthSource, /getActiveAdminCredentialRevision/);
  assert.match(loginRouteSource, /setAdminAuthCookies/);
  assert.match(refreshRouteSource, /rotateRefreshToken\(refreshToken\)/);
  assert.match(refreshRouteSource, /RTR_INVALID/);
});

test("admin imports panel exposes operational id password update flow", async () => {
  const source = await readFile(adminImportsPanelPath, "utf8");

  assert.match(source, /ID\/PW 수정/);
  assert.match(source, /admin-credential-login/);
  assert.match(source, /admin-credential-update/);
  assert.match(source, /새 아이디/);
  assert.match(source, /새 비밀번호/);
  assert.match(source, /비밀번호 확인/);
});
