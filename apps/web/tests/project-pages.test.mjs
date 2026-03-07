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

  assert.match(cardSource, /rounded-3xl border border-border\/60 bg-card/);
  assert.match(cardSource, /href=\{`\/projects\/\$\{project\.slug\}`\}/);
  assert.doesNotMatch(cardSource, /class="surface-card"/);
  assert.doesNotMatch(cardSource, /class="thumb"/);

  assert.match(indexSource, /import ProjectCard from/);
  assert.match(indexSource, /max-w-6xl/);
  assert.match(indexSource, /rounded-\[2rem\] border border-border\/60 bg-card/);
  assert.match(indexSource, /Lorem ipsum dolor sit amet/);
  assert.doesNotMatch(indexSource, /프로젝트 아카이브/);
  assert.doesNotMatch(indexSource, /Collection Snapshot/);
  assert.doesNotMatch(indexSource, /class="hero"/);
});

test("project detail page keeps the original placeholder copy inside the new public layout", async () => {
  const source = await readFile(projectDetailPath, "utf8");

  assert.match(source, /getProjectBySlug/);
  assert.match(source, /rounded-3xl border border-border\/60 bg-card/);
  assert.match(source, /PROJECT DETAIL/);
  assert.match(source, /Lorem ipsum/);
  assert.match(source, /Dolor sit amet/);
  assert.match(source, /Lorem back/);
  assert.doesNotMatch(source, /class="hero"/);
  assert.doesNotMatch(source, /class="surface-card"/);
  assert.doesNotMatch(source, /프로젝트 개요/);
  assert.doesNotMatch(source, /주요 기여/);
  assert.doesNotMatch(source, /Project Notes/);
  assert.doesNotMatch(source, /프로젝트로 돌아가기/);
});
