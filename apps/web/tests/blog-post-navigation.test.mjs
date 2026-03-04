import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const blogPostLayoutPath = new URL('../src/layouts/BlogPost.astro', import.meta.url);
const componentsStylePath = new URL('../src/styles/components.css', import.meta.url);

test('blog post layout includes top back link and bottom archive link', async () => {
  const source = await readFile(blogPostLayoutPath, 'utf8');

  assert.match(source, /class="post-back-link button button-ghost"/);
  assert.match(source, /href="\/blog\/"/);
  assert.match(source, /블로그로 돌아가기/);
  assert.match(source, /class="post-archive-link button button-ghost"/);
  assert.match(source, /모든 글 보기/);
});

test('blog post navigation classes have dedicated styling hooks', async () => {
  const source = await readFile(componentsStylePath, 'utf8');

  assert.match(source, /\.post-top-nav/);
  assert.match(source, /\.post-bottom-nav/);
  assert.match(source, /\.post-back-link/);
  assert.match(source, /\.post-archive-link/);
});
