import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { test } from 'node:test';

const removedDummyFiles = [
  'src/content/blog/first-post.md',
  'src/content/blog/second-post.md',
  'src/content/blog/third-post.md',
  'src/content/blog/markdown-style-guide.md',
  'src/content/blog/using-mdx.mdx',
];

for (const file of removedDummyFiles) {
  test(`dummy content file is removed: ${file}`, async () => {
    await assert.rejects(
      access(new URL(`../${file}`, import.meta.url), constants.F_OK),
      {
        code: 'ENOENT',
      },
    );
  });
}
