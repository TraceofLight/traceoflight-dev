import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const projectCardPath = new URL(
  "../src/components/ProjectCard.astro",
  import.meta.url,
);
const projectIndexPath = new URL(
  "../src/pages/[locale]/projects/index.astro",
  import.meta.url,
);
const projectDetailPath = new URL(
  "../src/pages/[locale]/projects/[slug].astro",
  import.meta.url,
);
const projectOrderPanelPath = new URL(
  "../src/components/public/ProjectOrderPanel.tsx",
  import.meta.url,
);

test("project card and list page use the new public card shell", async () => {
  const [cardSource, indexSource, orderPanelSource] = await Promise.all([
    readFile(projectCardPath, "utf8"),
    readFile(projectIndexPath, "utf8"),
    readFile(projectOrderPanelPath, "utf8"),
  ]);

  assert.match(
    cardSource,
    /import \{[\s\S]*buildImageFallbackOnError[\s\S]*toBrowserImageUrl[\s\S]*\} from "\.\.\/lib\/cover-media";/,
  );
  assert.match(
    cardSource,
    /import \{[\s\S]*PUBLIC_HOVER_CARD_CLASS[\s\S]*PUBLIC_MEDIA_FRAME_CLASS[\s\S]*\} from "\.\.\/lib\/ui-effects";/,
  );
  assert.match(cardSource, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(cardSource, /const anchorClass = `flex h-full flex-col p-3 \$\{PUBLIC_HOVER_CARD_CLASS\}`;/);
  assert.match(cardSource, /imageWidth = (960|IMAGE_SIZES\.postCard\.width)/);
  assert.match(cardSource, /imageHeight = (640|IMAGE_SIZES\.postCard\.height)/);
  // The card may pass project.coverImageUrl directly or via a coverImageSource
  // intermediate variable for srcset reuse.
  assert.match(
    cardSource,
    /toBrowserImageUrl\((?:project\.coverImageUrl \?\? fallbackCoverImage|coverImageSource),\s*\{/,
  );
  assert.match(
    cardSource,
    /(?:project\.coverImageUrl \?\? fallbackCoverImage|const coverImageSource = project\.coverImageUrl \?\? fallbackCoverImage)/,
  );
  assert.match(cardSource, /fit:\s*"inside"/);
  assert.match(cardSource, /onerror=\{coverImageFallbackOnError\}/);
  assert.match(cardSource, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(cardSource, /object-cover object-center/);
  // The card builds the href from an optional `locale` prop, with `/projects/<slug>`
  // as a graceful fallback when no locale is provided.
  assert.match(
    cardSource,
    /projectHref\s*=\s*locale\s*\?\s*`\/\$\{locale\}\/projects\/\$\{project\.slug\}`\s*:\s*`\/projects\/\$\{project\.slug\}`/,
  );
  assert.match(cardSource, /href=\{projectHref\}/);
  assert.match(cardSource, /data-astro-reload/);
  assert.doesNotMatch(cardSource, /class="surface-card"/);
  assert.doesNotMatch(cardSource, /class="thumb"/);

  assert.match(indexSource, /import ProjectCard from/);
  assert.match(indexSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(indexSource, /verifyAccessToken/);
  assert.doesNotMatch(indexSource, /max-w-6xl/);
  assert.match(indexSource, /<section class="flex w-full flex-col gap-8">/);
  assert.match(indexSource, /<header class="space-y-4 text-center">/);
  assert.match(indexSource, /listPublishedDbProjects|getPublishedProjectBySlug|listPublishedDbProjectPosts/);
  assert.match(indexSource, /ProjectOrderPanel/);
  assert.match(indexSource, /\/admin\/posts\/new\?content_kind=project/);
  // "Write post" copy is now sourced from the dictionary so it adapts per locale.
  assert.match(indexSource, /\{t\.archiveFilters\.writePost\}/);
  assert.match(indexSource, /isAdminViewer && \(/);
  assert.match(indexSource, /<ProjectOrderPanel client:load projects=\{projects\} \/>/);
  assert.match(orderPanelSource, /title="프로젝트 순서 조정"/);
  assert.match(orderPanelSource, /\/internal-api\/projects\/order/);
  assert.doesNotMatch(indexSource, /getProjects\(/);
  assert.doesNotMatch(
    indexSource,
    /<header[\s\S]*rounded-\[2\.25rem\] border border-white\/80 bg-white\/92 p-6 shadow-\[0_24px_60px_rgba\(15,23,42,0\.08\)\]/,
  );
  assert.match(indexSource, />\s*Projects\s*</);
  assert.match(indexSource, /게임 개발과 그래픽스, 웹 작업을 포함한 TraceofLight의 프로젝트 모음/);
  // The hero subtitle paragraph (under the H1) is the user-authored copy that
  // must not be silently dropped during i18n refactors. It reads from the
  // dictionary so each locale carries its own translation.
  assert.match(indexSource, /\{t\.home\.projectsArchiveSubtitle\}/);
  assert.doesNotMatch(indexSource, /Lorem ipsum dolor sit amet/);
  assert.doesNotMatch(indexSource, /프로젝트 아카이브/);
  assert.doesNotMatch(indexSource, /Collection Snapshot/);
  assert.doesNotMatch(indexSource, /class="surface-card"/);
});

test("project detail page keeps the original placeholder copy inside the new public layout", async () => {
  const source = await readFile(projectDetailPath, "utf8");

  assert.match(source, /getPublishedDbProjectBySlug/);
  assert.doesNotMatch(source, /getSeriesBySlug/);
  assert.doesNotMatch(source, /SeriesAdminPanel/);
  assert.match(source, /PostAdminActions/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(
    source,
    /import \{[\s\S]*PUBLIC_BADGE_STRONG_CLASS[\s\S]*PUBLIC_EMPTY_STATE_CLASS[\s\S]*PUBLIC_PANEL_SURFACE_CLASS[\s\S]*PUBLIC_SECTION_SURFACE_CLASS[\s\S]*PUBLIC_SURFACE_ACTION_CLASS[\s\S]*\} from "\.\.\/\.\.\/\.\.\/lib\/ui-effects";/,
  );
  assert.match(source, /class=\{PUBLIC_BADGE_STRONG_CLASS\}/);
  assert.match(source, /PUBLIC_SECTION_SURFACE_CLASS/);
  assert.match(source, /class=\{PUBLIC_SURFACE_ACTION_CLASS\}/);
  assert.match(source, /class=\{`\$\{PUBLIC_EMPTY_STATE_CLASS\} px-6 py-12 text-center`\}/);
  assert.match(source, /ABOUT PROJECT/);
  assert.match(source, /project\.projectProfile|projectProfile/);
  assert.match(source, /project\.summary/);
  assert.match(source, /project\.intro/);
  assert.match(source, /project\.topMediaKind/);
  assert.match(source, /project\.topMediaImageUrl/);
  assert.match(source, /project\.topMediaYoutubeUrl/);
  assert.match(source, /project\.topMediaVideoUrl/);
  // Project meta sections (role, intro, resources, description) read headings
  // from the dictionary instead of hardcoded Korean copy.
  assert.match(source, /\{t\.projectDetail\.role\}/);
  assert.match(source, /\{t\.projectDetail\.intro\}/);
  assert.match(source, /\{t\.projectDetail\.resources\}/);
  assert.match(source, /\{t\.projectDetail\.description\}/);
  assert.match(source, /\{project\.intro\}/);
  assert.match(source, /<section class="grid gap-6 lg:grid-cols-\[minmax\(0,1\.7fr\)_minmax\(260px,0\.8fr\)\]">/);
  assert.match(source, /relatedSeriesPosts|related series/i);
  // The "related posts" heading is the same string used by blog series links.
  assert.match(source, /\{t\.blogPost\.relatedSeries\}/);
  // "View all" / "Back to list" are dictionary entries shared with other pages.
  assert.match(source, /\{t\.buttons\.viewAll\}/);
  assert.match(source, /\{t\.buttons\.backToList\}/);
  assert.match(source, /class="markdown-prose mt-5 text-base leading-8 text-foreground\/85"/);
  assert.match(source, /toYoutubeEmbedUrl/);
  assert.match(source, /topMediaKind === "video"/);
  assert.match(source, /topMediaVideoUrl/);
  assert.match(source, /<video/);
  assert.match(source, /data-project-top-video/);
  assert.match(source, /<source/);
  assert.match(source, /type="video\/mp4"/);
  assert.match(source, /class="mt-4 flex flex-col items-start gap-3"/);
  assert.match(source, /class=\{`w-full justify-start \$\{PUBLIC_SURFACE_ACTION_CLASS\}`\}/);
  assert.match(source, /topMediaKind === "youtube"/);
  assert.match(source, /topMediaYoutubeUrl/);
  assert.match(source, /astro:page-load/);
  assert.match(source, /video\.load\(\)/);
  assert.match(source, /isAdminViewer &&/);
  assert.match(source, /adminPostSlug=\{project\.slug\}/);
  // Not-found and back-to-list strings are sourced from the dictionary.
  assert.match(source, /\{t\.notFound\.title\}/);
  assert.match(source, /\{t\.notFound\.description\}/);
  assert.doesNotMatch(source, /class="section"/);
  assert.doesNotMatch(source, /class="surface-card"/);
  assert.doesNotMatch(source, /프로젝트 개요/);
  assert.doesNotMatch(source, /주요 기여/);
  assert.doesNotMatch(source, /Project Notes/);
  assert.doesNotMatch(source, /getProjectBySlug/);
  assert.doesNotMatch(source, /projectProfile\?\.detail_media_kind/);
  assert.doesNotMatch(source, /detailMediaKind === "image"/);
  assert.doesNotMatch(source, /replace\("watch\?v=", "embed\/"\)/);
  assert.doesNotMatch(source, /related series posts/);
  assert.doesNotMatch(source, /Lorem ipsum/i);
});
