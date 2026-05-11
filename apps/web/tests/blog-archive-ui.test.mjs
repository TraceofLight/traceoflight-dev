import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogIndexPath = new URL("../src/pages/[locale]/blog/index.astro", import.meta.url);
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
    /import BlogArchiveFilters(?:,\s*\{[\s\S]*type BlogArchivePost[\s\S]*\})? from ["'](?:\.\.\/)*components\/public\/BlogArchiveFilters["']/,
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
    /import \{[\s\S]*(?:field|mediaFrame|surface)[\s\S]*\} from ["']@\/lib\/ui["'];/,
    "BlogArchiveFilters.tsx should import recipes from @/lib/ui",
  );
  assert.match(source, /placeholder=\{labels\.searchPlaceholder\}/);
  assert.match(source, /aria-label=\{labels\.sortLabel\}/);
  assert.match(source, /labels\.writePost/);
  assert.match(source, /비공개/);
  assert.match(source, /labels\.totalCountPrefix[\s\S]*\{totalCount\}[\s\S]*labels\.totalCountSuffix/);
  assert.doesNotMatch(source, /const archiveIntroClass =/);
  assert.match(source, /<header className="space-y-3 text-center">/);
  assert.match(source, /surface\(\{[^}]*kind:\s*["']section["'][^}]*tone:\s*["']strong["']/);
  assert.match(source, /const filterChipClass =/);
  assert.match(source, /const filterChipInactiveClass =/);
  assert.match(source, /const filterChipActiveClass =/);
  assert.match(source, /const isAllChipActive =/);
  assert.match(
    source,
    /className=\{cn\([\s\S]*filterChipClass,[\s\S]*isAllChipActive \? filterChipActiveClass : filterChipInactiveClass[\s\S]*\)\}/,
  );
  assert.match(source, /blog-filter-chip/);
  assert.match(source, /border-info\/90 bg-info-soft text-foreground shadow-card ring-1 ring-info\/80/);
  assert.doesNotMatch(source, /dark:border-sky-300\/55/);
  assert.doesNotMatch(source, /dark:bg-sky-400\/24/);
  assert.doesNotMatch(source, /dark:text-sky-50/);
  // Dark-mode chip styles are now handled via semantic CSS tokens (bg-info-soft,
  // border-info) that adapt automatically — no explicit dark override needed.
  assert.doesNotMatch(source, /dark:border-sky-300\/55/);
  assert.match(source, /border-surface-border bg-surface-soft text-foreground\/80 shadow-pill hover:bg-surface-strong hover:text-foreground/);
  assert.match(source, /field\(\{[^}]*kind:\s*["']frame["']/);
  assert.match(source, /surface\(\{[^}]*kind:\s*["']card["'][^}]*interactive:\s*true/);
  assert.match(source, /const mediaFrameClass = mediaFrame\(\)/);
  assert.match(source, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(
    source,
    /className="absolute inset-0 block !h-full !w-full !max-w-none object-cover object-center media-card-zoom"/,
  );
  assert.match(
    baseCssSource,
    /\.media-load-frame > \.media-card-zoom \{[\s\S]*transition:[\s\S]*opacity 180ms ease,[\s\S]*transform 500ms cubic-bezier\(0, 0, 0\.2, 1\);[\s\S]*\}/,
  );
  assert.match(source, /object-cover object-center/);
  assert.match(source, /const fallbackCoverImageSrc = toBrowserImageUrl\([\s\S]*fit:\s*"inside"/);
  assert.match(source, /onError=\{\(event\) => \{/);
  assert.match(source, /event\.currentTarget\.src !== fallbackCoverImageSrc/);
  assert.match(source, /event\.currentTarget\.src = fallbackCoverImageSrc/);
  assert.match(source, /const mediaFrameClass = mediaFrame\(\)/);
  assert.match(source, /commentCount: number;/);
  assert.match(source, /labels\.commentTitle[\s\S]*\{post\.commentCount\}/);
  assert.match(source, /labels\.commentTitle[\s\S]*\{post\.commentCount\}[\s\S]*<span aria-hidden="true">•<\/span>[\s\S]*<span>\{post\.readingLabel\}<\/span>/);
  assert.match(source, /const deferredQuery = useDeferredValue\(query\);/);
  assert.match(source, /setAvailableTagFilters\(payload\.tagFilters\);/);
  assert.match(source, /locale\?: string;/);
  assert.match(source, /href=\{`\/\$\{locale\}\/blog\/\$\{post\.slug\}\/`\}/);
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
    /import \{[\s\S]*(?:mediaFrame|surface)[\s\S]*(?:mediaFrame|surface)[\s\S]*\} from "\.\.\/lib\/ui";/,
    "PostCard.astro should import surface and mediaFrame recipes",
  );
  assert.match(source, /imageWidth = (960|IMAGE_SIZES\.postCard\.width)/);
  assert.match(
    source,
    /surface\(\{[^}]*kind:\s*["']card["'][^}]*interactive:\s*true/,
    "PostCard.astro should use interactive card surface",
  );
  assert.match(source, /const mediaFrameClass = mediaFrame\(\)/);
  assert.match(source, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(source, /object-cover object-center/);
  assert.match(source, /line-clamp-2 text-sm text-muted-foreground/);
  assert.match(source, /data-visibility=/);
  assert.match(source, /data-tags=/);
  assert.doesNotMatch(source, /post-card-default-anchor/);
  assert.doesNotMatch(source, /post-card-archive-anchor/);
});
