import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const postCommentsRoutePath = new URL(
  "../src/pages/internal-api/posts/[slug]/comments.ts",
  import.meta.url,
);
const commentByIdRoutePath = new URL(
  "../src/pages/internal-api/comments/[id].ts",
  import.meta.url,
);
const adminCommentsRoutePath = new URL(
  "../src/pages/internal-api/admin/comments.ts",
  import.meta.url,
);

test("internal-api post comments route proxies get and post with admin-aware auth", async () => {
  const source = await readFile(postCommentsRoutePath, "utf8");

  assert.match(source, /export const GET/);
  assert.match(source, /export const POST/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /requestBackend\(`\/posts\/\$\{slug\}\/comments`\)/);
  assert.match(source, /requestBackend\(`\/posts\/\$\{slug\}\/comments`, \{/);
});

test("internal-api comment by id route proxies patch and delete with optional admin secret", async () => {
  const source = await readFile(commentByIdRoutePath, "utf8");

  assert.match(source, /export const PATCH/);
  assert.match(source, /export const DELETE/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /requestBackend\(`\/comments\/\$\{commentId\}`/);
});

test("internal-api admin comments route requires admin session before proxying", async () => {
  const source = await readFile(adminCommentsRoutePath, "utf8");

  assert.match(source, /export const GET/);
  assert.match(source, /unauthorizedImportsResponse/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /requestBackend\(`\/admin\/comments\$\{query\}`/);
});
