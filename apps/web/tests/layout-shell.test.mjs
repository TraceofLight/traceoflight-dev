import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const baseLayoutPath = new URL('../src/layouts/BaseLayout.astro', import.meta.url);
const layoutCssPath = new URL('../src/styles/layout.css', import.meta.url);
const baseCssPath = new URL('../src/styles/base.css', import.meta.url);

test('base layout uses site-shell body for sticky footer layout', async () => {
  const [layoutSource, cssSource] = await Promise.all([
    readFile(baseLayoutPath, 'utf8'),
    readFile(layoutCssPath, 'utf8'),
  ]);

  assert.match(layoutSource, /<body class="site-shell">/);
  assert.match(cssSource, /\.site-shell\s*\{/);
  assert.match(cssSource, /flex-direction:\s*column/);
  assert.match(cssSource, /\.page\s*\{[\s\S]*flex:\s*1 0 auto/);
});

test('base stylesheet includes sr-only utility class', async () => {
  const source = await readFile(baseCssPath, 'utf8');

  assert.match(source, /\.sr-only\s*\{/);
  assert.match(source, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
});
