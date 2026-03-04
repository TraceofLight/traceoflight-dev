import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const footerPath = new URL('../src/components/Footer.astro', import.meta.url);

test('footer uses single-line rights copy with auto year and without lorem description', async () => {
  const source = await readFile(footerPath, 'utf8');

  assert.match(source, /const currentYear = new Date\(\)\.getFullYear\(\);/);
  assert.match(source, /\{currentYear\} \{SITE_TITLE\} all rights reserved\./);
  assert.doesNotMatch(source, /\{SITE_DESCRIPTION\}/);
});
