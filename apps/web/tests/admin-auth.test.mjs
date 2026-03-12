import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function exists(relativePath) {
  await access(path.join(projectRoot, relativePath));
}

test("admin auth middleware and routes are present", async () => {
  await exists("src/middleware.ts");
  await exists("src/pages/internal-api/auth/login.ts");
  await exists("src/pages/internal-api/auth/refresh.ts");
  await exists("src/pages/internal-api/auth/logout.ts");
  await exists("src/pages/logout.ts");
  await exists("src/pages/admin/posts/new.astro");
  await exists("src/pages/admin/posts/[slug]/edit.astro");

  const middleware = await read("src/middleware.ts");
  assert.match(middleware, /pathname\.startsWith\(["']\/admin["']\)/);
  assert.match(middleware, /pathname\.startsWith\(["']\/internal-api["']\)/);
  assert.match(
    middleware,
    /pathname\.startsWith\(["']\/internal-api\/auth\/["']\)/,
  );
  assert.match(
    middleware,
    /pathname\.startsWith\(["']\/internal-api\/media\/browser-image["']\)/,
  );
  assert.match(middleware, /admin_login=1/);
  assert.doesNotMatch(middleware, /\/admin\/login/);
  assert.doesNotMatch(middleware, /\/admin\/logout/);
});

test("logout routes keep POST logout while preventing direct internal-api dead-end pages", async () => {
  const [internalSource, publicSource] = await Promise.all([
    read("src/pages/internal-api/auth/logout.ts"),
    read("src/pages/logout.ts"),
  ]);

  assert.match(internalSource, /export const POST: APIRoute = performLogout;/);
  assert.match(internalSource, /export const GET: APIRoute/);
  assert.doesNotMatch(internalSource, /clearAdminAuthCookies\(cookies\)[\s\S]*export const GET/);
  assert.match(publicSource, /export const POST: APIRoute/);
  assert.match(publicSource, /createAdminLogoutResponse/);
  assert.match(publicSource, /createAdminLogoutRedirect/);
});
