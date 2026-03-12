import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const baseLayoutPath = new URL('../src/layouts/BaseLayout.astro', import.meta.url);
const baseCssPath = new URL('../src/styles/base.css', import.meta.url);
const headerPath = new URL('../src/components/Header.astro', import.meta.url);
const footerPath = new URL('../src/components/Footer.astro', import.meta.url);

test('base layout uses site-shell body for sticky footer layout', async () => {
  const [layoutSource, cssSource, headerSource, footerSource] = await Promise.all([
    readFile(baseLayoutPath, 'utf8'),
    readFile(baseCssPath, 'utf8'),
    readFile(headerPath, 'utf8'),
    readFile(footerPath, 'utf8'),
  ]);

  assert.match(layoutSource, /<body class="site-shell">/);
  assert.match(layoutSource, /<Header \/>/);
  assert.match(layoutSource, /<Footer visitorSummary=\{visitorSummary\} \/>/);
  assert.doesNotMatch(layoutSource, /transition:persist/);
  assert.match(cssSource, /body\s*\{/);
  assert.doesNotMatch(headerSource, /class="site-header"/);
  assert.doesNotMatch(footerSource, /class="site-footer"/);
  assert.match(headerSource, /border-b/);
  assert.match(footerSource, /FooterAdminModal/);
});

test('base stylesheet includes sr-only utility class', async () => {
  const source = await readFile(baseCssPath, 'utf8');

  assert.match(source, /\.sr-only\s*\{/);
  assert.match(source, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
});
