import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const layoutCssPath = new URL("../src/styles/layout.css", import.meta.url);
const baseCssPath = new URL("../src/styles/base.css", import.meta.url);

test("public layout uses the wider container width by default", async () => {
  const source = await readFile(layoutCssPath, "utf8");

  assert.match(source, /\.container \{\s*width: min\(1360px, calc\(100% - 2\.4rem\)\);/);
  assert.match(source, /width: min\(1360px, calc\(100% - 1\.4rem\)\);/);
  assert.doesNotMatch(source, /html\.page-blog-post \.container/);
});

test("markdown prose code blocks use the dracula card styling", async () => {
  const source = await readFile(baseCssPath, "utf8");

  assert.match(source, /\.markdown-prose pre \{/);
  assert.match(source, /background: linear-gradient\(180deg, #343746 0%, #282a36 18%\);/);
  assert.match(source, /\.markdown-prose pre::before \{/);
  assert.match(source, /box-shadow: 1\.15rem 0 0 #ffbd2e, 2\.3rem 0 0 #27c93f;/);
  assert.match(source, /\.markdown-prose pre code\.hljs \{/);
  assert.match(source, /color: #f8f8f2;/);
  assert.match(source, /\.markdown-prose \.hljs-keyword/);
  assert.match(source, /color: #ff79c6;/);
  assert.doesNotMatch(source, /\.markdown-prose pre::after \{/);
  assert.doesNotMatch(source, /content: "dracula";/);
});
