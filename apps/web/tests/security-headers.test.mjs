import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const middlewarePath = new URL("../src/middleware.ts", import.meta.url);

test("middleware applies baseline security headers to normal responses", async () => {
  const source = await readFile(middlewarePath, "utf8");

  assert.match(source, /X-Frame-Options/);
  assert.match(source, /DENY/);
  assert.match(source, /X-Content-Type-Options/);
  assert.match(source, /nosniff/);
  assert.match(source, /Referrer-Policy/);
  assert.match(source, /strict-origin-when-cross-origin/);
  assert.match(source, /Permissions-Policy/);
  assert.match(source, /camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /frame-src 'self' https:\/\/www\.youtube-nocookie\.com https:\/\/www\.youtube\.com/);
});
