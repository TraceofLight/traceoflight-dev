import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const blogDbPath = new URL('../src/lib/blog-db.ts', import.meta.url);
const postCardPath = new URL('../src/components/PostCard.astro', import.meta.url);
const blogIndexPath = new URL('../src/pages/blog/index.astro', import.meta.url);
const blogPostPath = new URL('../src/pages/blog/[...slug].astro', import.meta.url);

test('db blog source defaults to public visibility filter', async () => {
  const source = await readFile(blogDbPath, 'utf8');
  assert.match(source, /params\.set\('visibility', 'public'\)/);
});

test('blog list enables private visibility for authenticated admin viewer', async () => {
  const source = await readFile(blogIndexPath, 'utf8');
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /includePrivate:\s*isAdminViewer/);
});

test('blog detail enables private visibility for authenticated admin viewer', async () => {
  const source = await readFile(blogPostPath, 'utf8');
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /includePrivate:\s*isAdminViewer/);
});

test('post card renders private badge for private visibility post', async () => {
  const source = await readFile(postCardPath, 'utf8');
  assert.match(source, /post\.visibility\s*===\s*'private'/);
  assert.match(source, /post-visibility-badge/);
  assert.match(source, /Private/);
});
