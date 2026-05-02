import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogIndexPath = new URL("../src/pages/blog/index.astro", import.meta.url);
const blogArchiveFiltersPath = new URL(
  "../src/components/public/BlogArchiveFilters.tsx",
  import.meta.url,
);
const postCardPath = new URL(
  "../src/components/PostCard.astro",
  import.meta.url,
);

test("blog archive page mounts a React filter island and passes server data", async () => {
  const [pageSource, islandSource] = await Promise.all([
    readFile(blogIndexPath, "utf8"),
    readFile(blogArchiveFiltersPath, "utf8"),
  ]);

  assert.match(
    pageSource,
    /import BlogArchiveFilters(?:,\s*\{[\s\S]*type BlogArchivePost[\s\S]*\})? from ["']\.\.\/\.\.\/components\/public\/BlogArchiveFilters["']/,
  );
  assert.match(pageSource, /<BlogArchiveFilters[\s\S]*client:load/);
  assert.match(pageSource, /initialPosts=\{initialPosts\}/);
  assert.match(pageSource, /initialHasMore=\{initialHasMore\}/);
  assert.match(pageSource, /initialOffset=\{initialOffset\}/);
  assert.match(pageSource, /initialTotalCount=\{initialTotalCount\}/);
  assert.match(pageSource, /tagFilters=\{tagFilters\}/);
  assert.match(pageSource, /initialSelectedTags=\{selectedTagsFromQuery\}/);
  assert.doesNotMatch(pageSource, /initializeBlogArchivePage/);
  assert.doesNotMatch(
    pageSource,
    /document\.addEventListener\(["']astro:page-load["']/,
  );

  assert.match(islandSource, /type BlogArchivePost/);
  assert.match(islandSource, /window\.history\.replaceState/);
  assert.match(islandSource, /IntersectionObserver/);
  assert.match(islandSource, /return `\/internal-api\/posts\/summary\?\$\{params\.toString\(\)\}`;/);
  assert.match(pageSource, /toBrowserImageUrl\(/);
  assert.match(pageSource, /commentCount: post\.commentCount \?\? 0,/);
  assert.match(
    pageSource,
    /coverImageSrc: resolveCoverImageSrc\([\s\S]*post,[\s\S]*POST_CARD_IMAGE_SIZE\.width,[\s\S]*POST_CARD_IMAGE_SIZE\.height,?[\s\S]*\)/,
  );
});

test("blog archive filter island provides search, sort, and admin visibility controls", async () => {
  const [source, baseCssSource] = await Promise.all([
    readFile(blogArchiveFiltersPath, "utf8"),
    readFile(new URL("../src/styles/base.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /import \{ cn \} from ["']@\/lib\/utils["'];/);
  assert.match(
    source,
    /import \{[\s\S]*PUBLIC_FIELD_FRAME_CLASS[\s\S]*PUBLIC_HOVER_CARD_CLASS[\s\S]*PUBLIC_MEDIA_FRAME_CLASS[\s\S]*PUBLIC_SECTION_SURFACE_STRONG_CLASS[\s\S]*\} from ["']@\/lib\/ui-effects["'];/,
  );
  assert.match(source, /placeholder="포스트 검색/);
  assert.match(source, /aria-label="정렬 방식"/);
  assert.match(source, /글 작성/);
  assert.match(source, /비공개/);
  assert.match(source, /총 \{totalCount\}개의 포스트/);
  assert.doesNotMatch(source, /const archiveIntroClass =/);
  assert.match(source, /<header className="space-y-3 text-center">/);
  assert.match(source, /PUBLIC_SECTION_SURFACE_STRONG_CLASS/);
  assert.match(source, /const filterChipClass =/);
  assert.match(source, /const filterChipInactiveClass =/);
  assert.match(source, /const filterChipActiveClass =/);
  assert.match(source, /const isAllChipActive =/);
  assert.match(
    source,
    /className=\{cn\([\s\S]*filterChipClass,[\s\S]*isAllChipActive \? filterChipActiveClass : filterChipInactiveClass[\s\S]*\)\}/,
  );
  assert.match(source, /blog-filter-chip/);
  assert.match(
    source,
    /border-sky-300\/90 bg-sky-200\/85 text-sky-950 shadow-\[0_18px_36px_rgba\(56,189,248,0\.16\)\] ring-1 ring-sky-300\/80/,
  );
  assert.doesNotMatch(source, /dark:border-sky-300\/55/);
  assert.doesNotMatch(source, /dark:bg-sky-400\/24/);
  assert.doesNotMatch(source, /dark:text-sky-50/);
  assert.match(
    baseCssSource,
    /html\[data-theme='dark'\] \.blog-filter-chip\[data-active='true'\] \{/,
  );
  assert.match(source, /bg-slate-100\/92[\s\S]*text-foreground\/80[\s\S]*hover:bg-white/);
  assert.match(source, /PUBLIC_FIELD_FRAME_CLASS/);
  assert.match(source, /const anchorClass = `flex h-full flex-col p-3 \$\{PUBLIC_HOVER_CARD_CLASS\}`;/);
  assert.match(source, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(source, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(source, /object-cover object-center/);
  assert.match(source, /const fallbackCoverImageSrc = toBrowserImageUrl\([\s\S]*fit:\s*"inside"/);
  assert.match(source, /onError=\{\(event\) => \{/);
  assert.match(source, /event\.currentTarget\.src !== fallbackCoverImageSrc/);
  assert.match(source, /event\.currentTarget\.src = fallbackCoverImageSrc/);
  assert.match(source, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(source, /commentCount: number;/);
  assert.match(source, /댓글 \{post\.commentCount\}개/);
  assert.match(source, /댓글 \{post\.commentCount\}개[\s\S]*<span aria-hidden="true">•<\/span>[\s\S]*<span>\{post\.readingLabel\}<\/span>/);
  assert.match(source, /const deferredQuery = useDeferredValue\(query\);/);
  assert.match(source, /setAvailableTagFilters\(payload\.tagFilters\);/);
});

test("blog archive page does not cap db-backed posts at a fixed 50-item fetch", async () => {
  const source = await readFile(blogIndexPath, "utf8");

  assert.match(source, /listPublishedDbPostSummaryPage\(/);
  assert.doesNotMatch(source, /listAllPublishedDbPosts\(/);
  assert.doesNotMatch(source, /body:\s*post\.bodyMarkdown/);
});

test("post card uses a wide image-led public card structure", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(
    source,
    /import \{[\s\S]*PUBLIC_HOVER_CARD_CLASS[\s\S]*PUBLIC_MEDIA_FRAME_CLASS[\s\S]*\} from "\.\.\/lib\/ui-effects";/,
  );
  assert.match(source, /imageWidth = (960|IMAGE_SIZES\.postCard\.width)/);
  assert.match(source, /const anchorClass = `flex h-full flex-col p-3 \$\{PUBLIC_HOVER_CARD_CLASS\}`;/);
  assert.match(source, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(source, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(source, /object-cover object-center/);
  assert.match(source, /line-clamp-2 text-sm text-muted-foreground/);
  assert.match(source, /data-visibility=/);
  assert.match(source, /data-tags=/);
  assert.doesNotMatch(source, /post-card-default-anchor/);
  assert.doesNotMatch(source, /post-card-archive-anchor/);
});
