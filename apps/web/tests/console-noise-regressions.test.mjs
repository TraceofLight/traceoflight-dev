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
  ]);

  assert.doesNotMatch(baseHeadSource, /PretendardVariable\.woff2/);
  assert.match(baseLayoutSource, /<FloatingUtilityButtons client:only="react" \/>/);
  assert.match(headerSource, /<MobileNavSheet client:only="react"/);
  assert.match(footerSource, /<FooterAdminModal\s+client:only="react"/);

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
