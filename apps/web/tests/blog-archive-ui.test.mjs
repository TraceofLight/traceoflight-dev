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
  assert.match(source, /id="blog-filter-panel"/);
  assert.match(source, /data-visibility-filter="all"/);
  assert.match(source, /data-visibility-filter/);
  assert.match(source, /isAdminViewer && \([\s\S]*data-visibility-filter="public"[\s\S]*data-visibility-filter="private"/);
  assert.doesNotMatch(source, /id="blog-filter-toggle"/);
  assert.match(source, /variant="archive"/);
  assert.match(source, /id="blog-post-grid"/);
});

test('blog archive page includes client script for filtering and sorting cards', async () => {
  const source = await readFile(blogIndexPath, 'utf8');

  assert.match(source, /function initializeBlogArchivePage\(\)/);
  assert.match(source, /const searchInput = document\.querySelector\('#blog-search'\)/);
  assert.match(source, /const sortSelect = document\.querySelector\('#blog-sort'\)/);
  assert.match(source, /applyFiltersAndSort/);
  assert.match(source, /document\.addEventListener\('astro:page-load', initializeBlogArchivePage\)/);
  assert.match(source, /data-visibility/);
});

test('blog archive script filters cards using data attributes rather than class-only selectors', async () => {
  const source = await readFile(blogIndexPath, 'utf8');
  assert.match(source, /querySelectorAll\('\[data-visibility\]'\)/);
  assert.match(source, /toggleAttribute\('hidden', !isVisible\)/);
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

test('archive sort select uses aligned padding with custom arrow placement', async () => {
  const styleSource = await readFile(stylesPath, 'utf8');
  assert.match(styleSource, /\.blog-archive-control-actions select \{[\s\S]*appearance:\s*none;/);
  assert.match(styleSource, /\.blog-archive-control-actions select \{[\s\S]*background-position:\s*right 0\.9rem center;/);
});

test('hidden archive cards are forced out of layout', async () => {
  const styleSource = await readFile(stylesPath, 'utf8');
  assert.match(styleSource, /\.blog-archive-grid \.post-card\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important;/);
});
