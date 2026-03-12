import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const homePagePath = new URL("../src/pages/index.astro", import.meta.url);
const headerPath = new URL("../src/components/Header.astro", import.meta.url);

test("home page uses tailwind sections while keeping the curated resume content", async () => {
  const source = await readFile(homePagePath, "utf8");

  assert.doesNotMatch(source, /max-w-6xl/);
  assert.match(source, /<div class="flex w-full flex-col gap-8 py-10 sm:py-12">/);
  assert.doesNotMatch(source, /class="home-resume"/);
  assert.doesNotMatch(source, /class="home-panel home-profile"/);
  assert.doesNotMatch(source, /import "\.\.\/styles\/components\/home\.css";/);
  assert.match(source, /id="home-experience-education"/);
  assert.match(source, /id="home-featured-projects"/);
  assert.match(source, /id="home-tech-stack"/);
  assert.match(source, /id="home-featured-series"/);
  assert.match(source, /id="home-latest-posts"/);
  assert.match(source, /TraceofLight/);
  assert.doesNotMatch(source, /김희준 \(Heejun Kim\)/);
  assert.doesNotMatch(source, /rickyjun96@gmail\.com/);
  assert.match(source, /\/icons\/tech\/java\.svg/);
  assert.match(source, /\/icons\/tech\/hlsl\.svg/);
  assert.match(source, /\/icons\/tech\/directx11\.webp/);
  assert.match(source, /\/icons\/tech\/unrealengine\.svg/);
  assert.match(source, /\/icons\/tech\/react\.svg/);
  assert.match(source, /\/icons\/tech\/fastapi\.svg/);
  assert.match(source, /\/icons\/tech\/vim\.svg/);
  assert.match(source, /import SeriesCard from "\.\.\/components\/SeriesCard\.astro";/);
  assert.match(source, /featuredSeriesCards\.length > 0/);
  assert.match(source, /아직 등록된 시리즈가 없습니다\./);
  assert.match(
    source,
    /id="home-experience-heading"[\s\S]*?>\s*Profile\s*<\/h2>/,
  );
  assert.match(source, /id="home-tech-heading"[\s\S]*?>\s*Skill\s*<\/h2>/);
  assert.doesNotMatch(source, /경험과 이력/);
  assert.doesNotMatch(source, /기술 스택/);
  assert.doesNotMatch(source, /함께 만들 이야기/);
  assert.doesNotMatch(source, /<p[\s\S]*?>\s*Work\s*<\/p>/);
  assert.doesNotMatch(source, /<p[\s\S]*?>\s*Series\s*<\/p>/);
  assert.doesNotMatch(source, /<p[\s\S]*?>\s*Blog\s*<\/p>/);
  assert.doesNotMatch(source, /<p[\s\S]*?>\s*Profile\s*<\/p>/);
  assert.doesNotMatch(source, /<p[\s\S]*?>\s*Skill\s*<\/p>/);
  assert.doesNotMatch(source, /<p[\s\S]*?>\s*Connect\s*<\/p>/);
  assert.doesNotMatch(source, /Connect/);
  assert.doesNotMatch(source, /resume\.pdf/);
  assert.doesNotMatch(source, /010-\d{3,4}-\d{4}/);
  assert.match(source, /traceoflight-profile\.png/);
  assert.match(source, /<SeriesCard series=\{card\} imageWidth=\{960\} imageHeight=\{640\} \/>/);
  assert.match(source, /"Game Development"/);
  assert.match(source, /"Graphics Programming"/);
  assert.match(source, /"Database Engineering"/);
  assert.match(
    source,
    /import \{[\s\S]*PUBLIC_BADGE_CLASS[\s\S]*PUBLIC_BADGE_STRONG_CLASS[\s\S]*PUBLIC_EMPTY_STATE_CLASS[\s\S]*PUBLIC_PANEL_SURFACE_CLASS[\s\S]*PUBLIC_PILL_CLASS[\s\S]*PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS[\s\S]*PUBLIC_SECTION_SURFACE_CLASS[\s\S]*PUBLIC_SURFACE_ACTION_CLASS[\s\S]*PUBLIC_TOP_MEDIA_PANEL_SURFACE_CLASS[\s\S]*PUBLIC_TOP_MEDIA_SURFACE_CLASS[\s\S]*\} from "\.\.\/lib\/ui-effects";/,
  );
  assert.match(
    source,
    /const topMediaShellClass =[\s\S]*`\$\{PUBLIC_TOP_MEDIA_SURFACE_CLASS\} p-5 lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(320px,0\.65fr\)\] lg:p-6`;/,
  );
  assert.match(
    source,
    /const topMediaCopyPanelClass =[\s\S]*`\$\{PUBLIC_TOP_MEDIA_PANEL_SURFACE_CLASS\} px-6 py-7 sm:px-8 sm:py-8`;/,
  );
  assert.match(source, /const sectionShellClass = `\$\{PUBLIC_SECTION_SURFACE_CLASS\} p-6`;/);
  assert.match(source, /const panelSurfaceClass = `\$\{PUBLIC_PANEL_SURFACE_CLASS\} p-5`;/);
  assert.match(source, /<article class=\{panelSurfaceClass\}>|<article[\s\S]*class=\{panelSurfaceClass\}/);
  assert.match(source, /const pillClass = PUBLIC_PILL_CLASS;/);
  assert.match(
    source,
    /const primaryOutlineActionClass = PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS;/,
  );
  assert.match(
    source,
    /const surfaceActionClass = PUBLIC_SURFACE_ACTION_CLASS;/,
  );
  assert.match(source, /<a class=\{primaryOutlineActionClass\} href="\/projects">\s*프로젝트 보기\s*<\/a>/);
  assert.match(source, /<a class=\{primaryOutlineActionClass\} href="\/blog">\s*블로그 보기\s*<\/a>/);
  assert.match(source, /<a class=\{surfaceActionClass\} href="\/projects">\s*View All Projects\s*<\/a>/);
  assert.match(source, /<a class=\{surfaceActionClass\} href="\/series">\s*View All Series\s*<\/a>/);
  assert.match(source, /<li class=\{PUBLIC_BADGE_CLASS\}>/);
  assert.match(source, /<li class=\{PUBLIC_BADGE_STRONG_CLASS\}>/);
  assert.match(source, /iconClass:\s*"theme-invert-on-light"/);
  assert.match(source, /<img[\s\S]*class=\{item\.iconClass\}[\s\S]*width="18"/);
  assert.match(source, /<div class=\{`\$\{PUBLIC_EMPTY_STATE_CLASS\} mt-6 px-6 py-10 text-center text-sm text-muted-foreground`\}>/);
  assert.doesNotMatch(source, /PUBLIC_HERO_/);
  assert.doesNotMatch(source, /"Cloud-Native Database"/);
  assert.doesNotMatch(source, /"Backend API"/);
  assert.doesNotMatch(source, /"Frontend Engineering"/);
  assert.doesNotMatch(source, /"Technical Writing"/);

  const expIndex = source.indexOf('id="home-experience-education"');
  const stackIndex = source.indexOf('id="home-tech-stack"');
  const projectIndex = source.indexOf('id="home-featured-projects"');
  const seriesIndex = source.indexOf('id="home-featured-series"');
  const postIndex = source.indexOf('id="home-latest-posts"');

  assert.ok(expIndex < stackIndex);
  assert.ok(stackIndex < projectIndex);
  assert.ok(stackIndex < seriesIndex);
  assert.ok(seriesIndex < postIndex);

  const education2026Index = source.indexOf("2026.02.");
  const education2023Index = source.indexOf("2023.08.");
  const education2022Index = source.indexOf("2022.08.");
  assert.ok(education2026Index < education2023Index);
  assert.ok(education2023Index < education2022Index);

  const leftEducationIndex = source.indexOf('title: "Education"');
  const leftLicenseIndex = source.indexOf('title: "License"');
  const leftMilServiceIndex = source.indexOf('title: "Military Service"');
  assert.ok(leftEducationIndex < leftLicenseIndex);
  assert.ok(leftLicenseIndex < leftMilServiceIndex);

  const rightCareerIndex = source.indexOf('title: "Career"');
  const rightExperienceIndex = source.indexOf('title: "Experience"');
  const rightAwardIndex = source.indexOf('title: "Award"');
  assert.ok(rightCareerIndex < rightExperienceIndex);
  assert.ok(rightExperienceIndex < rightAwardIndex);

  assert.match(source, /title:\s*"Web"/);
  assert.doesNotMatch(source, /divider:\s*true/);
  assert.doesNotMatch(source, /title:\s*"Backend"/);
  assert.doesNotMatch(source, /title:\s*"Frontend"/);
  assert.match(source, /title:\s*"Language"/);
  assert.match(source, /label:\s*"HLSL",\s*icon:\s*"\/icons\/tech\/hlsl\.svg"/);
  assert.doesNotMatch(source, /label:\s*"HLSL",\s*fallback:\s*"HLSL"/);
  assert.match(source, /period:\s*"2023\.10\. ~ 2024\.11\."/);
  assert.match(source, /main:\s*"Cloud-Native 차세대 DB 개발 프로젝트 참여"/);
  assert.match(
    source,
    /const resumeRowClass =\s*"grid gap-1 sm:grid-cols-\[136px_minmax\(0,1fr\)\] sm:items-start sm:gap-3";/,
  );
  assert.match(source, /const resumePeriodClass = "text-sm leading-7 font-medium text-foreground";/);
  assert.match(source, /const resumeContentClass = "space-y-0\.5";/);
  assert.match(source, /const resumeTextClass = "text-sm leading-7 text-muted-foreground";/);

  assert.match(source, /2021\.11\./);
  assert.match(source, /sub:\s*"[^"]*\\n: [^"]*"/);
});

test("home page no longer depends on dedicated home css hooks", async () => {
  const source = await readFile(homePagePath, "utf8");
  assert.doesNotMatch(source, /home-resume-grid/);
  assert.doesNotMatch(source, /home-resume-badges/);
  assert.doesNotMatch(source, /home-post-list/);
  assert.doesNotMatch(source, /home-stack-divider/);
  assert.doesNotMatch(source, /home-stack-card-language/);
  assert.doesNotMatch(source, /home-section/);
  assert.doesNotMatch(source, /home-stack-groups/);
  assert.doesNotMatch(source, /home-stack-items-inline/);
  assert.doesNotMatch(source, /home-contact-links/);
  assert.doesNotMatch(source, /home-profile-icon/);
  assert.doesNotMatch(source, /home-series-empty/);
});

test("site header brand uses text-only mark without avatar image", async () => {
  const source = await readFile(headerPath, "utf8");
  assert.match(source, /SITE_TITLE/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /id="header-admin-link"/);
  assert.match(source, /id="header-admin-logout"/);
  assert.match(source, /<form class="flex" method="GET" action=\{ADMIN_IMPORTS_PATH\}>/);
  assert.match(source, /<button[\s\S]*id="header-admin-link"[\s\S]*type="submit"/);
  assert.match(source, /\/logout\?next=\//);
  assert.match(source, /import \{ DANGER_PILL_ACTION_CLASS \} from "\.\.\/lib\/ui-effects";/);
  assert.match(
    source,
    /id="header-admin-link"[\s\S]*class=\{DANGER_PILL_ACTION_CLASS\}/,
  );
  assert.match(
    source,
    /id="header-admin-logout"[\s\S]*class=\{DANGER_PILL_ACTION_CLASS\}/,
  );
  assert.match(source, /MobileNavSheet/);
  assert.doesNotMatch(source, /brand-avatar/);
  assert.doesNotMatch(source, /traceoflight-profile\.png/);
});
