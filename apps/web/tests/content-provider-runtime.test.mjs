import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const contentSourcePath = new URL('../src/lib/content-source.ts', import.meta.url);
const homePath = new URL('../src/pages/index.astro', import.meta.url);
const rssPath = new URL('../src/pages/rss.xml.js', import.meta.url);

test('content provider reads runtime env before build env', async () => {
  const source = await readFile(contentSourcePath, 'utf8');

  assert.match(source, /process\.env\.CONTENT_PROVIDER/);
  assert.match(source, /import\.meta\.env\.CONTENT_PROVIDER/);
});

test('home page supports db provider posts', async () => {
  const source = await readFile(homePath, 'utf8');

  assert.match(source, /getContentProvider/);
  assert.match(source, /listPublishedDbPostSummaries/);
  assert.match(source, /provider === ["']db["']/);
  assert.match(source, /pubDate:\s*post\.publishedAt/);
});

test('rss route supports db provider posts', async () => {
  const source = await readFile(rssPath, 'utf8');

  assert.match(source, /getContentProvider/);
  assert.match(source, /listAllPublishedDbPosts/);
  assert.match(source, /provider === ["']db["']/);
});

test('blog archive page maps db card dates from publishedAt', async () => {
  const source = await readFile(new URL('../src/pages/blog/index.astro', import.meta.url), 'utf8');

  assert.match(source, /pubDate:\s*post\.publishedAt/);
});
