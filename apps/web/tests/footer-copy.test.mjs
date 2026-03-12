import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const footerPath = new URL("../src/components/Footer.astro", import.meta.url);
const constsPath = new URL("../src/consts.ts", import.meta.url);
const blogPostPagePath = new URL("../src/pages/blog/[...slug].astro", import.meta.url);

test("footer uses compact two-line rights copy with visitor summary metadata", async () => {
  const source = await readFile(footerPath, "utf8");

  assert.match(source, /const currentYear = new Date\(\)\.getFullYear\(\);/);
  assert.match(source, /interface Props \{\s*visitorSummary\?:/);
  assert.match(
    source,
    /ⓒ \{currentYear\}\. \{SITE_TITLE\} All rights reserved\./,
  );
  assert.match(source, /Today \{visitorSummary\.todayVisitors\} \/ Total \{visitorSummary\.totalVisitors\}/);
  assert.doesNotMatch(source, /\{SITE_DESCRIPTION\}/);
  assert.match(source, /FooterAdminModal/);
  assert.match(source, /shouldOpenOnLoad=\{shouldOpenAdminLogin\}/);
  assert.match(source, /adminNextPath=\{adminNextPath\}/);
  assert.match(source, /ADMIN_IMPORTS_PATH/);
  assert.match(source, /href=\{ADMIN_IMPORTS_PATH\}/);
  assert.match(source, /href="\/portfolio"/);
  assert.match(source, /label="Portfolio PDF"/);
  assert.match(source, /icon="resume"/);
  assert.match(source, /label="Admin Console"/);
  assert.match(source, /icon="admin"/);
  assert.doesNotMatch(source, /text-red-700/);
  assert.doesNotMatch(source, />\s*Admin\s*</);
});

test("site metadata and missing blog fallback use real copy instead of lorem ipsum", async () => {
  const [constsSource, blogFallbackSource] = await Promise.all([
    readFile(constsPath, "utf8"),
    readFile(blogPostPagePath, "utf8"),
  ]);

  assert.doesNotMatch(constsSource, /Lorem ipsum/i);
  assert.doesNotMatch(blogFallbackSource, /Lorem ipsum/i);
  assert.match(blogFallbackSource, /게시글을 찾을 수 없습니다/);
  assert.match(blogFallbackSource, /삭제되었거나 비공개로 전환된 글일 수 있습니다/);
  assert.match(blogFallbackSource, /블로그로 돌아가기/);
});
