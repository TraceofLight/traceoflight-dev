import { test } from "node:test";
import assert from "node:assert/strict";

test("dictionary modules export same key shape", async () => {
  const { ko } = await import("../src/lib/i18n/dict/ko.ts");
  const { en } = await import("../src/lib/i18n/dict/en.ts");
  const { ja } = await import("../src/lib/i18n/dict/ja.ts");
  const { zh } = await import("../src/lib/i18n/dict/zh.ts");

  function flatten(obj, prefix = "") {
    return Object.entries(obj).flatMap(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      return typeof v === "object" && v !== null ? flatten(v, key) : [key];
    });
  }

  const koKeys = flatten(ko).sort();
  for (const [name, dict] of [["en", en], ["ja", ja], ["zh", zh]]) {
    const keys = flatten(dict).sort();
    assert.deepEqual(keys, koKeys, `${name} dictionary key shape diverged from ko`);
  }
});

test("Korean dictionary preserves user-authored copy that prior refactors silently dropped", async () => {
  const { ko } = await import("../src/lib/i18n/dict/ko.ts");

  // Hero intro paragraphs — must remain split into top + bottom.
  assert.equal(
    ko.home.introTop,
    "상상을 현실로, 가상 세계에 생동감을 불어넣는 개발자 TraceofLight입니다.",
  );
  assert.equal(
    ko.home.introBottom,
    "위로는 새로운 기술에 대한 호기심, 아래로는 기반 지식에 대한 꾸준한 탐구를 바탕으로 성장 중입니다.",
  );

  // Archive subtitles (under the section H1).
  assert.equal(
    ko.home.seriesArchiveSubtitle,
    "TraceofLight의 다양한 이야기를 주제별로 엮은 서고",
  );
  assert.equal(
    ko.home.projectsArchiveSubtitle,
    "참여한 프로젝트들과 진행하면서 느끼고 고민한 것들",
  );

  // "View All XXX" buttons that previously sat at the section corner.
  assert.equal(ko.home.viewAllProjects, "View All Projects");
  assert.equal(ko.home.viewAllSeries, "View All Series");
  assert.equal(ko.home.viewAllPosts, "View All Posts");

  // Empty-state phrasing keeps the "아직 등록된" qualifier the user wrote.
  assert.equal(ko.empty.noPosts, "게시글이 아직 없습니다.");
  assert.equal(ko.empty.noProjects, "아직 등록된 프로젝트가 없습니다.");
  assert.equal(ko.empty.noSeries, "아직 등록된 시리즈가 없습니다.");

  // Series progress indicator template.
  assert.equal(ko.blogPost.seriesProgress, "{total}개 글 중 {order}번째");
});

test("non-Korean dictionaries keep View All buttons in English (matching hero design)", async () => {
  for (const localeName of ["en", "ja", "zh"]) {
    const mod = await import(`../src/lib/i18n/dict/${localeName}.ts`);
    const dict = mod[localeName];
    assert.equal(dict.home.viewAllProjects, "View All Projects", `${localeName}.home.viewAllProjects`);
    assert.equal(dict.home.viewAllSeries, "View All Series", `${localeName}.home.viewAllSeries`);
    assert.equal(dict.home.viewAllPosts, "View All Posts", `${localeName}.home.viewAllPosts`);
  }
});

test("non-Korean dictionaries keep an explicit seriesProgress template with {order} and {total} placeholders", async () => {
  for (const localeName of ["en", "ja", "zh"]) {
    const mod = await import(`../src/lib/i18n/dict/${localeName}.ts`);
    const dict = mod[localeName];
    const template = dict.blogPost.seriesProgress;
    assert.ok(typeof template === "string" && template.length > 0, `${localeName} seriesProgress missing`);
    assert.ok(template.includes("{order}"), `${localeName} seriesProgress missing {order} placeholder`);
    assert.ok(template.includes("{total}"), `${localeName} seriesProgress missing {total} placeholder`);
  }
});
