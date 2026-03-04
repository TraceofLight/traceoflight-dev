import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const blogIndexPath = new URL('../src/pages/blog/index.astro', import.meta.url);
const postCardPath = new URL('../src/components/PostCard.astro', import.meta.url);
const stylesPath = new URL('../src/styles/components.css', import.meta.url);

test('blog archive page provides search, sort, and visibility filters', async () => {
  const source = await readFile(blogIndexPath, 'utf8');

  assert.match(source, /id="blog-search"/);
  assert.match(source, /id="blog-sort"/);
  assert.match(source, /data-visibility-filter/);
  assert.match(source, /variant="archive"/);
  assert.match(source, /id="blog-post-grid"/);
});

test('blog archive page includes client script for filtering and sorting cards', async () => {
  const source = await readFile(blogIndexPath, 'utf8');

  assert.match(source, /const searchInput = document\.querySelector\('#blog-search'\)/);
  assert.match(source, /const sortSelect = document\.querySelector\('#blog-sort'\)/);
  assert.match(source, /applyFiltersAndSort/);
  assert.match(source, /data-visibility/);
});

test('post card supports archive variant markup and styles', async () => {
  const [cardSource, styleSource] = await Promise.all([
    readFile(postCardPath, 'utf8'),
    readFile(stylesPath, 'utf8'),
  ]);

  assert.match(cardSource, /variant\?: 'default' \| 'archive'/);
  assert.match(cardSource, /post-card-archive/);
  assert.match(styleSource, /\.post-card-archive/);
  assert.match(styleSource, /\.blog-archive/);
});
