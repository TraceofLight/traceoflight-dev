import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function exists(relativePath) {
  await access(path.join(projectRoot, relativePath));
}

test("rss route uses shared blog source abstraction", async () => {
  const rssSource = await read("src/pages/rss.xml.js");
  assert.match(rssSource, /getBlogSource/);
  assert.doesNotMatch(rssSource, /getCollection\('blog'\)/);
});

test("blog source slug lookup avoids listPosts indirection", async () => {
  const source = await read("src/lib/content-source.ts");
  assert.match(source, /getCollection\('blog',/);
  assert.doesNotMatch(source, /const posts = await this\.listPosts\(\);/);
});

test("blog and project list markup is extracted to shared components", async () => {
  await exists("src/components/PostCard.astro");
  await exists("src/components/ProjectCard.astro");
  await exists("src/components/public/BlogArchiveFilters.tsx");

  const homePage = await read("src/pages/index.astro");
  const blogIndex = await read("src/pages/blog/index.astro");
  const projectIndex = await read("src/pages/projects/index.astro");

  assert.match(homePage, /import PostCard from/);
  assert.match(homePage, /import ProjectCard from/);
  assert.match(blogIndex, /import BlogArchiveFilters(?:,\s*\{[\s\S]*type BlogArchivePost[\s\S]*\})? from/);
  assert.doesNotMatch(blogIndex, /import PostCard from/);
  assert.match(projectIndex, /import ProjectCard from/);
});

test("global stylesheet is split into modular imports", async () => {
  await exists("src/styles/tokens.css");
  await exists("src/styles/base.css");
  await exists("src/styles/layout.css");
  await exists("src/styles/components.css");

  const globalCss = await read("src/styles/global.css");
  assert.match(globalCss, /@import ["']\.\/tokens\.css["'];/);
  assert.match(globalCss, /@import ["']\.\/base\.css["'];/);
  assert.match(globalCss, /@import ["']\.\/layout\.css["'];/);
  assert.match(globalCss, /@import ["']\.\/components\.css["'];/);
});

test("component stylesheet is split by domain modules", async () => {
  await exists("src/styles/components/writer.css");

  const componentsCss = await read("src/styles/components.css");
  assert.match(componentsCss, /@import ["']\.\/components\/writer\.css["'];/);
  assert.doesNotMatch(
    componentsCss,
    /@import ["']\.\/components\/common\.css["'];/,
  );
  assert.doesNotMatch(
    componentsCss,
    /@import ["']\.\/components\/blog\.css["'];/,
  );
  assert.doesNotMatch(
    componentsCss,
    /@import ["']\.\/components\/admin\.css["'];/,
  );
});

test("legacy public css hooks are removed while writer css stays wired", async () => {
  const [layoutCss, blogSlugPage, emptyStateNotice] = await Promise.all([
    read("src/styles/layout.css"),
    read("src/pages/blog/[...slug].astro"),
    read("src/components/EmptyStateNotice.astro"),
  ]);

  assert.doesNotMatch(layoutCss, /\.site-header\s*\{/);
  assert.doesNotMatch(layoutCss, /\.site-footer\s*\{/);
  assert.doesNotMatch(layoutCss, /\.surface-card\s*\{/);
  assert.doesNotMatch(layoutCss, /\.section\s*\{/);
  assert.doesNotMatch(blogSlugPage, /class="section"/);
  assert.doesNotMatch(emptyStateNotice, /class="button"/);
});

test("writer stylesheet is split by concern modules", async () => {
  await exists("src/styles/components/writer/core.css");
  await exists("src/styles/components/writer/layers.css");
  await exists("src/styles/components/writer/fields.css");
  await exists("src/styles/components/writer/editor.css");
  await exists("src/styles/components/writer/preview.css");
  await exists("src/styles/components/writer/responsive.css");

  const writerCss = await read("src/styles/components/writer.css");
  assert.match(writerCss, /@import ["']\.\/writer\/core\.css["'];/);
  assert.match(writerCss, /@import ["']\.\/writer\/layers\.css["'];/);
  assert.match(writerCss, /@import ["']\.\/writer\/fields\.css["'];/);
  assert.match(writerCss, /@import ["']\.\/writer\/editor\.css["'];/);
  assert.match(writerCss, /@import ["']\.\/writer\/preview\.css["'];/);
  assert.match(writerCss, /@import ["']\.\/writer\/responsive\.css["'];/);
});

test("admin writer script delegates helper concerns to sub-modules", async () => {
  await exists("src/lib/admin/new-post-page/types.ts");
  await exists("src/lib/admin/new-post-page/dom.ts");
  await exists("src/lib/admin/new-post-page/feedback.ts");
  await exists("src/lib/admin/new-post-page/slug.ts");
  await exists("src/lib/admin/new-post-page/drafts.ts");
  await exists("src/lib/admin/new-post-page/preview.ts");
  await exists("src/lib/admin/new-post-page/submit.ts");
  await exists("src/lib/admin/new-post-page/submit-events.ts");
  await exists("src/lib/admin/new-post-page/draft-layer-events.ts");
  await exists("src/lib/admin/new-post-page/drag-drop.ts");
  await exists("src/lib/admin/new-post-page/posts-api.ts");
  await exists("src/lib/admin/new-post-page/link-normalization.ts");
  await exists("src/lib/admin/new-post-page/editor-markdown.ts");
  await exists("src/lib/admin/new-post-page/upload.ts");
  await exists("src/lib/admin/new-post-page/editor-bridge.ts");
  await exists("src/lib/admin/new-post-page/loaders.ts");
  await exists("src/lib/admin/new-post-page/media-controller.ts");
  await exists("src/lib/admin/new-post-page/tags.ts");

  const [writerScript, submitEventsScript] = await Promise.all([
    read("src/lib/admin/new-post-page.ts"),
    read("src/lib/admin/new-post-page/submit-events.ts"),
  ]);
  const writerLineCount = writerScript.split(/\r?\n/).length;
  assert.ok(
    writerLineCount < 1000,
    `writer entry should stay orchestration-sized (current: ${writerLineCount})`,
  );
  assert.match(writerScript, /from ["']\.\/new-post-page\/dom["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/types["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/feedback["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/slug["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/loaders["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/media-controller["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/preview["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/submit-events["']/);
  assert.match(
    writerScript,
    /from ["']\.\/new-post-page\/draft-layer-events["']/,
  );
  assert.match(writerScript, /from ["']\.\/new-post-page\/posts-api["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/tags["']/);
  assert.match(
    writerScript,
    /from ["']\.\/new-post-page\/link-normalization["']/,
  );
  assert.match(writerScript, /from ["']\.\/new-post-page\/editor-markdown["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/upload["']/);
  assert.match(writerScript, /from ["']\.\/new-post-page\/editor-bridge["']/);
  assert.match(submitEventsScript, /from ["']\.\/submit["']/);
  assert.doesNotMatch(writerScript, /function slugify\(/);
  assert.doesNotMatch(writerScript, /function normalizeMarkdownLinks\(/);
  assert.doesNotMatch(writerScript, /async function createUploadBundle\(/);
  assert.doesNotMatch(writerScript, /function buildDraftQueryPath\(/);
  assert.doesNotMatch(writerScript, /function isMediaFileDrag\(/);
});
