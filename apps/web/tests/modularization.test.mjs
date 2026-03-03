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

test('rss route uses shared blog source abstraction', async () => {
  const rssSource = await read('src/pages/rss.xml.js');
  assert.match(rssSource, /getBlogSource/);
  assert.doesNotMatch(rssSource, /getCollection\('blog'\)/);
});

test('blog source slug lookup avoids listPosts indirection', async () => {
  const source = await read('src/lib/content-source.ts');
  assert.match(source, /getCollection\('blog',/);
  assert.doesNotMatch(source, /const posts = await this\.listPosts\(\);/);
});

test('blog and project list markup is extracted to shared components', async () => {
  await exists('src/components/PostCard.astro');
  await exists('src/components/ProjectCard.astro');

  const homePage = await read('src/pages/index.astro');
  const blogIndex = await read('src/pages/blog/index.astro');
  const projectIndex = await read('src/pages/projects/index.astro');

  assert.match(homePage, /import PostCard from/);
  assert.match(homePage, /import ProjectCard from/);
  assert.match(blogIndex, /import PostCard from/);
  assert.match(projectIndex, /import ProjectCard from/);
});

test('global stylesheet is split into modular imports', async () => {
  await exists('src/styles/tokens.css');
  await exists('src/styles/base.css');
  await exists('src/styles/layout.css');
  await exists('src/styles/components.css');

  const globalCss = await read('src/styles/global.css');
  assert.match(globalCss, /@import '\.\/tokens\.css';/);
  assert.match(globalCss, /@import '\.\/base\.css';/);
  assert.match(globalCss, /@import '\.\/layout\.css';/);
  assert.match(globalCss, /@import '\.\/components\.css';/);
});
