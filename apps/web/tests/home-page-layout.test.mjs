import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const homePagePath = new URL("../src/pages/index.astro", import.meta.url);
const homeStylePath = new URL(
  "../src/styles/components/home.css",
  import.meta.url,
);
const headerPath = new URL("../src/components/Header.astro", import.meta.url);

test("home page uses cruzlab-like modular home sections", async () => {
  const source = await readFile(homePagePath, "utf8");

  assert.match(source, /class="home-resume"/);
  assert.match(source, /class="home-panel home-profile"/);
  assert.match(source, /id="home-experience-education"/);
  assert.match(source, /id="home-featured-projects"/);
  assert.match(source, /id="home-tech-stack"/);
  assert.match(source, /id="home-featured-series"/);
  assert.match(source, /id="home-latest-posts"/);
  assert.match(source, /id="home-connect"/);
  assert.match(source, /href:\s*"\/resume\.pdf"/);
  assert.match(source, /TraceofLight/);
  assert.doesNotMatch(source, /김희준 \(Heejun Kim\)/);
  assert.match(source, /rickyjun96@gmail\.com/);
  assert.match(source, /\/icons\/tech\/java\.svg/);
  assert.match(source, /\/icons\/tech\/directx11\.webp/);
  assert.match(source, /\/icons\/tech\/react\.svg/);
  assert.match(source, /\/icons\/tech\/fastapi\.svg/);
  assert.match(source, /\/icons\/tech\/vim\.svg/);
  assert.match(source, /home-stack-icon/);
  assert.match(source, /home-resume-grid/);
  assert.match(source, /home-resume-badges/);
  assert.match(source, /home-post-list/);
  assert.match(source, /home-stack-divider/);
  assert.match(source, /home-stack-card-language/);
  assert.match(source, /home-stack-items-inline/);
  assert.match(source, /home-profile-icon/);
  assert.match(source, /featuredSeriesCards\.length > 0/);
  assert.match(source, /아직 등록된 시리즈가 없습니다\./);
  assert.match(source, /home-series-empty/);
  assert.doesNotMatch(source, /010-\d{3,4}-\d{4}/);
  assert.match(source, /traceoflight-profile\.png/);
  assert.match(source, /"Game Development"/);
  assert.match(source, /"Graphics Programming"/);
  assert.match(source, /"Database Engineering"/);
  assert.doesNotMatch(source, /"Cloud-Native Database"/);
  assert.doesNotMatch(source, /"Backend API"/);
  assert.doesNotMatch(source, /"Frontend Engineering"/);
  assert.doesNotMatch(source, /"Technical Writing"/);

  const expIndex = source.indexOf('id="home-experience-education"');
  const stackIndex = source.indexOf('id="home-tech-stack"');
  const projectIndex = source.indexOf('id="home-featured-projects"');
  const seriesIndex = source.indexOf('id="home-featured-series"');
  const postIndex = source.indexOf('id="home-latest-posts"');
  const connectIndex = source.indexOf('id="home-connect"');

  assert.ok(expIndex < stackIndex);
  assert.ok(stackIndex < projectIndex);
  assert.ok(stackIndex < seriesIndex);
  assert.ok(seriesIndex < postIndex);
  assert.ok(postIndex < connectIndex);

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
  assert.doesNotMatch(source, /title:\s*"Backend"/);
  assert.doesNotMatch(source, /title:\s*"Frontend"/);
  assert.match(source, /title:\s*"Language"/);
  assert.match(source, /period:\s*"2023\.10\. ~ 2024\.11\."/);
  assert.match(source, /main:\s*"Cloud-Native 차세대 DB 개발 프로젝트 참여"/);

  assert.match(source, /2021\.11\./);
  assert.match(source, /sub:\s*"[^"]*\\n: [^"]*"/);
});

test("home page imports dedicated home component style module", async () => {
  const source = await readFile(homePagePath, "utf8");
  assert.match(source, /import "\.\.\/styles\/components\/home\.css";/);
});

test("site header brand uses text-only mark without avatar image", async () => {
  const source = await readFile(headerPath, "utf8");
  assert.match(source, /class="brand"/);
  assert.match(source, /class="brand-name"/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /id="header-admin-link"/);
  assert.match(source, /id="header-admin-logout"/);
  assert.match(source, /\/internal-api\/auth\/logout/);
  assert.doesNotMatch(source, /brand-avatar/);
  assert.doesNotMatch(source, /traceoflight-profile\.png/);
});

test("home style module defines resume layout sections and responsive grid", async () => {
  const source = await readFile(homeStylePath, "utf8");

  assert.match(source, /\.home-panel/);
  assert.match(source, /\.home-resume-grid/);
  assert.match(source, /\.home-stack-groups/);
  assert.match(source, /\.home-stack-item/);
  assert.match(source, /\.home-stack-icon/);
  assert.match(source, /\.home-stack-divider/);
  assert.match(
    source,
    /\.home-stack-card-language\s*{[\s\S]*grid-column:\s*1 \/ -1/,
  );
  assert.match(
    source,
    /\.home-stack-items-inline\s*{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(source, /\.home-resume-sub\s*{[\s\S]*white-space:\s*pre-line/);
  assert.match(source, /\.home-resume-main-split/);
  assert.match(source, /\.home-resume-period/);
  assert.match(source, /\.home-resume-badges/);
  assert.match(source, /\.home-resume-badge-icon/);
  assert.match(source, /\.home-stack-item\s*{[\s\S]*min-height:\s*34px/);
  assert.doesNotMatch(source, /min-height:\s*236px/);
  assert.match(source, /\.home-series-grid/);
  assert.match(source, /\.home-contact-links/);
  assert.match(
    source,
    /\.home-profile\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.3fr\)\s*minmax\(250px,\s*0\.7fr\)/,
  );
  assert.match(
    source,
    /\.home-profile-visual\s*{[\s\S]*justify-content:\s*center/,
  );
  assert.match(source, /\.home-profile-icon\s*{[\s\S]*border-radius:\s*50%/);
  assert.match(source, /\.home-profile-icon\s*{[\s\S]*border:\s*0/);
  assert.match(source, /@media \(max-width: 760px\)/);
});
