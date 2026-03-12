import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const portfolioRoutePath = new URL("../src/pages/portfolio.ts", import.meta.url);
const resumeRoutePath = new URL("../src/pages/resume.ts", import.meta.url);

test("public portfolio route proxies the registered PDF while resume route is closed", async () => {
  const [portfolioSource, resumeSource] = await Promise.all([
    readFile(portfolioRoutePath, "utf8"),
    readFile(resumeRoutePath, "utf8"),
  ]);

  assert.match(portfolioSource, /export const GET/);
  assert.match(portfolioSource, /requestBackend\(["']\/portfolio["']/);
  assert.match(portfolioSource, /application\/pdf/);
  assert.match(portfolioSource, /등록된 포트폴리오 PDF가 없습니다/);
  assert.match(portfolioSource, /filename="portfolio\.pdf"/);
  assert.match(portfolioSource, /content-type["']:\s*["']text\/html; charset=utf-8["']/);

  assert.match(resumeSource, /export const GET/);
  assert.match(resumeSource, /status:\s*404/);
  assert.doesNotMatch(resumeSource, /requestBackend\(/);
});
