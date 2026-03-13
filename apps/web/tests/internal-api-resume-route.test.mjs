import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const portfolioUploadRoutePath = new URL(
  "../src/pages/internal-api/portfolio/upload.ts",
  import.meta.url,
);
const portfolioStatusRoutePath = new URL(
  "../src/pages/internal-api/portfolio/status.ts",
  import.meta.url,
);
const resumeUploadRoutePath = new URL(
  "../src/pages/internal-api/resume/upload.ts",
  import.meta.url,
);
const resumeStatusRoutePath = new URL(
  "../src/pages/internal-api/resume/status.ts",
  import.meta.url,
);
const portfolioDeleteRoutePath = new URL(
  "../src/pages/internal-api/portfolio/delete.ts",
  import.meta.url,
);
const resumeDeleteRoutePath = new URL(
  "../src/pages/internal-api/resume/delete.ts",
  import.meta.url,
);

test("internal-api portfolio and resume routes both proxy active admin pdf operations", async () => {
  const [
    portfolioUploadSource,
    portfolioStatusSource,
    resumeUploadSource,
    resumeStatusSource,
    portfolioDeleteSource,
    resumeDeleteSource,
  ] = await Promise.all([
    readFile(portfolioUploadRoutePath, "utf8"),
    readFile(portfolioStatusRoutePath, "utf8"),
    readFile(resumeUploadRoutePath, "utf8"),
    readFile(resumeStatusRoutePath, "utf8"),
    readFile(portfolioDeleteRoutePath, "utf8"),
    readFile(resumeDeleteRoutePath, "utf8"),
  ]);

  assert.match(portfolioUploadSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(portfolioUploadSource, /verifyAccessToken/);
  assert.match(portfolioUploadSource, /export const POST/);
  assert.match(portfolioUploadSource, /requestBackend\(["']\/portfolio["']/);
  assert.match(portfolioUploadSource, /file is required/);
  assert.match(portfolioStatusSource, /export const GET/);
  assert.match(portfolioStatusSource, /requestBackend\(["']\/portfolio\/status["']/);

  assert.match(resumeUploadSource, /export const POST/);
  assert.match(resumeUploadSource, /ADMIN_ACCESS_COOKIE/);
  assert.match(resumeUploadSource, /verifyAccessToken/);
  assert.match(resumeUploadSource, /requestBackend\(["']\/resume["']/);
  assert.match(resumeStatusSource, /export const GET/);
  assert.match(resumeStatusSource, /requestBackend\(["']\/resume\/status["']/);
  assert.match(portfolioDeleteSource, /export const DELETE/);
  assert.match(portfolioDeleteSource, /requestBackend\(["']\/portfolio["']/);
  assert.match(resumeDeleteSource, /export const DELETE/);
  assert.match(resumeDeleteSource, /requestBackend\(["']\/resume["']/);
});
