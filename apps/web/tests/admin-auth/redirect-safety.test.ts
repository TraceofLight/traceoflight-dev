import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeNextPath } from "../../src/lib/admin-redirect";

test("reject absolute external URL", () => {
  assert.equal(sanitizeNextPath("https://evil.example"), "/");
});

test("reject protocol relative URL", () => {
  assert.equal(sanitizeNextPath("//evil.example"), "/");
});

test("allow internal admin path", () => {
  assert.equal(sanitizeNextPath("/admin/posts/new"), "/admin/posts/new");
});

test("reject internal api path", () => {
  assert.equal(sanitizeNextPath("/internal-api/auth/refresh"), "/");
});
