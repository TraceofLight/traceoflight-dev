import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const baseHeadPath = new URL("../src/components/BaseHead.astro", import.meta.url);
const baseLayoutPath = new URL("../src/layouts/BaseLayout.astro", import.meta.url);
const headerPath = new URL("../src/components/Header.astro", import.meta.url);
const footerPath = new URL("../src/components/Footer.astro", import.meta.url);
const blogPostPath = new URL("../src/layouts/BlogPost.astro", import.meta.url);
const markdownRendererPath = new URL(
  "../src/lib/markdown-renderer-core.ts",
  import.meta.url,
);
const writerPreviewPath = new URL(
  "../src/lib/admin/new-post-page/preview.ts",
  import.meta.url,
);
const tokensCssPath = new URL("../src/styles/tokens.css", import.meta.url);
const newWriterPagePath = new URL("../src/pages/admin/posts/new.astro", import.meta.url);
const editWriterPagePath = new URL(
  "../src/pages/admin/posts/[slug]/edit.astro",
  import.meta.url,
);
const projectDetailPath = new URL("../src/pages/projects/[slug].astro", import.meta.url);

test("public shell avoids known console-noise regressions", async () => {
  const [
    baseHeadSource,
    baseLayoutSource,
    headerSource,
    footerSource,
    blogPostSource,
    markdownRendererSource,
    writerPreviewSource,
    newWriterPageSource,
    editWriterPageSource,
    projectDetailSource,
    tokensCssSource,
  ] = await Promise.all([
    readFile(baseHeadPath, "utf8"),
    readFile(baseLayoutPath, "utf8"),
    readFile(headerPath, "utf8"),
    readFile(footerPath, "utf8"),
    readFile(blogPostPath, "utf8"),
    readFile(markdownRendererPath, "utf8"),
    readFile(writerPreviewPath, "utf8"),
    readFile(newWriterPagePath, "utf8"),
    readFile(editWriterPagePath, "utf8"),
    readFile(projectDetailPath, "utf8"),
    readFile(tokensCssPath, "utf8"),
  ]);

  assert.doesNotMatch(baseHeadSource, /PretendardVariable\.woff2/);
  assert.doesNotMatch(baseHeadSource, /meta name="generator"/);
  assert.doesNotMatch(tokensCssSource, /woff2-variations/);
  assert.match(tokensCssSource, /src:\s*url\('\/fonts\/PretendardVariable\.woff2'\)\s*format\('woff2'\)/);
  assert.match(baseLayoutSource, /<Footer visitorSummary=\{visitorSummary\} \/>/);
  assert.match(baseLayoutSource, /<FloatingUtilityButtons client:idle \/>/);
  assert.doesNotMatch(baseLayoutSource, /transition:persist/);
  assert.match(headerSource, /<MobileNavSheet client:media="\(\s*max-width:\s*767px\s*\)"/);
  assert.match(footerSource, /<FooterAdminModal\s+client:idle/);

  for (const source of [
    blogPostSource,
    markdownRendererSource,
    writerPreviewSource,
    newWriterPageSource,
    editWriterPageSource,
    projectDetailSource,
  ]) {
    assert.doesNotMatch(source, /allow="accelerometer/);
    assert.doesNotMatch(source, /clipboard-write/);
    assert.doesNotMatch(source, /picture-in-picture/);
  }
});
