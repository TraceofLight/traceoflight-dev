import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const homePath = new URL('../src/pages/[locale]/index.astro', import.meta.url);
const blogIndexPath = new URL('../src/pages/[locale]/blog/index.astro', import.meta.url);
const blogDetailPath = new URL('../src/pages/[locale]/blog/[...slug].astro', import.meta.url);

test('home page maps db post summary dates from publishedAt', async () => {
  const source = await readFile(homePath, 'utf8');

  assert.match(source, /listPublishedDbPostSummaries/);
  assert.match(source, /pubDate:\s*post\.publishedAt/);
});

test('blog archive page maps db card dates from publishedAt', async () => {
  const source = await readFile(blogIndexPath, 'utf8');

  assert.match(source, /pubDate:\s*post\.publishedAt/);
});

test('blog detail page maps db main date from publishedAt', async () => {
  const source = await readFile(blogDetailPath, 'utf8');

  assert.match(source, /pubDate=\{dbPost\.publishedAt\}/);
});

test('blog detail layout does not render public updated timestamp', async () => {
  const source = await readFile(new URL('../src/layouts/BlogPost.astro', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /updatedDate &&/);
  assert.doesNotMatch(source, /updated\{" "\}/);
});
