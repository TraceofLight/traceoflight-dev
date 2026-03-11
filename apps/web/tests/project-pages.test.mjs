import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const projectCardPath = new URL(
  "../src/components/ProjectCard.astro",
  import.meta.url,
);
const projectIndexPath = new URL(
  "../src/pages/projects/index.astro",
  import.meta.url,
);
const projectDetailPath = new URL(
  "../src/pages/projects/[slug].astro",
  import.meta.url,
);

test("project card and list page use the new public card shell", async () => {
  const [cardSource, indexSource] = await Promise.all([
    readFile(projectCardPath, "utf8"),
    readFile(projectIndexPath, "utf8"),
  ]);

  assert.match(
    cardSource,
    /import \{[\s\S]*PUBLIC_HOVER_CARD_CLASS[\s\S]*PUBLIC_MEDIA_FRAME_CLASS[\s\S]*\} from "\.\.\/lib\/ui-effects";/,
  );
  assert.match(cardSource, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(cardSource, /const anchorClass = `flex h-full flex-col p-3 \$\{PUBLIC_HOVER_CARD_CLASS\}`;/);
  assert.match(cardSource, /imageHeight = 640/);
  assert.match(cardSource, /!h-full !w-full !max-w-none object-cover object-center/);
  assert.match(cardSource, /object-cover object-center/);
  assert.match(cardSource, /href=\{`\/projects\/\$\{project\.slug\}`\}/);
  assert.doesNotMatch(cardSource, /class="surface-card"/);
  assert.doesNotMatch(cardSource, /class="thumb"/);

  assert.match(indexSource, /import ProjectCard from/);
  assert.match(indexSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(indexSource, /verifyAccessToken/);
  assert.match(indexSource, /max-w-6xl/);
  assert.match(indexSource, /<header class="space-y-4 text-center">/);
  assert.match(indexSource, /listPublishedDbProjects|getPublishedProjectBySlug|listPublishedDbProjectPosts/);
  assert.match(indexSource, /\/admin\/projects/);
  assert.match(indexSource, /\/admin\/posts\/new\?content_kind=project/);
  assert.match(indexSource, /순서 조정/);
  assert.match(indexSource, /글 작성/);
  assert.match(indexSource, /isAdminViewer && \(/);
  assert.doesNotMatch(indexSource, /getProjects\(/);
  assert.doesNotMatch(
    indexSource,
    /<header[\s\S]*rounded-\[2\.25rem\] border border-white\/80 bg-white\/92 p-6 shadow-\[0_24px_60px_rgba\(15,23,42,0\.08\)\]/,
  );
  assert.match(indexSource, />\s*Projects\s*</);
  assert.match(indexSource, /참여한 프로젝트들과 진행하면서 느끼고 고민한 것들/);
  assert.doesNotMatch(indexSource, /Lorem ipsum dolor sit amet/);
  assert.doesNotMatch(indexSource, /프로젝트 아카이브/);
  assert.doesNotMatch(indexSource, /Collection Snapshot/);
  assert.doesNotMatch(indexSource, /class="surface-card"/);
});

test("project detail page keeps the original placeholder copy inside the new public layout", async () => {
  const source = await readFile(projectDetailPath, "utf8");

  assert.match(source, /getPublishedDbProjectBySlug/);
  assert.match(source, /getSeriesBySlug/);
  assert.match(source, /SeriesAdminPanel/);
  assert.match(source, /PostAdminActions/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(
    source,
    /import \{[\s\S]*PUBLIC_BADGE_STRONG_CLASS[\s\S]*PUBLIC_EMPTY_STATE_CLASS[\s\S]*PUBLIC_PANEL_SURFACE_CLASS[\s\S]*PUBLIC_SECTION_SURFACE_CLASS[\s\S]*PUBLIC_SURFACE_ACTION_CLASS[\s\S]*\} from "\.\.\/\.\.\/lib\/ui-effects";/,
  );
  assert.match(source, /class=\{PUBLIC_BADGE_STRONG_CLASS\}/);
  assert.match(source, /PUBLIC_SECTION_SURFACE_CLASS/);
  assert.match(source, /class=\{PUBLIC_SURFACE_ACTION_CLASS\}/);
  assert.match(source, /class=\{`\$\{PUBLIC_EMPTY_STATE_CLASS\} px-6 py-12 text-center`\}/);
  assert.match(source, /PROJECT DETAIL/);
  assert.match(source, /project\.projectProfile|projectProfile/);
  assert.match(source, /project\.summary/);
  assert.match(source, /project\.intro/);
  assert.match(source, /프로젝트 소개/);
  assert.match(source, /project\.intro \|\| "프로젝트 소개 문구를 준비 중입니다\."/);
  assert.match(source, /relatedSeriesPosts|related series/i);
  assert.match(source, /연관된 포스팅 시리즈/);
  assert.match(source, /모든 프로젝트 보기/);
  assert.match(source, /toYoutubeEmbedUrl/);
  assert.match(source, /detailMediaKind === "video"/);
  assert.match(source, /detailVideoUrl/);
  assert.match(source, /<video/);
  assert.match(source, /isAdminViewer &&/);
  assert.match(source, /adminPostSlug=\{project\.slug\}/);
  assert.match(source, /프로젝트를 찾을 수 없습니다/);
  assert.match(source, /프로젝트 목록으로 돌아가기/);
  assert.doesNotMatch(source, /class="section"/);
  assert.doesNotMatch(source, /class="surface-card"/);
  assert.doesNotMatch(source, /프로젝트 개요/);
  assert.doesNotMatch(source, /주요 기여/);
  assert.doesNotMatch(source, /Project Notes/);
  assert.doesNotMatch(source, /getProjectBySlug/);
  assert.doesNotMatch(source, /replace\("watch\?v=", "embed\/"\)/);
  assert.doesNotMatch(source, /related series posts/);
  assert.doesNotMatch(source, /Lorem ipsum/i);
});
