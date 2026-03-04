import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

async function exists(relativePath) {
  await access(path.join(projectRoot, relativePath));
}

test('admin auth middleware and routes are present', async () => {
  await exists('src/middleware.ts');
  await exists('src/pages/internal-api/auth/login.ts');
  await exists('src/pages/internal-api/auth/refresh.ts');
  await exists('src/pages/internal-api/auth/logout.ts');
  await exists('src/pages/admin/logout.ts');
  await exists('src/pages/admin/login.astro');

  const middleware = await read('src/middleware.ts');
  assert.match(middleware, /pathname\.startsWith\('\/admin'\)/);
  assert.match(middleware, /pathname\.startsWith\('\/internal-api'\)/);
  assert.match(middleware, /pathname === '\/admin\/logout'/);
  assert.match(middleware, /pathname\.startsWith\('\/internal-api\/auth\/'\)/);
});
