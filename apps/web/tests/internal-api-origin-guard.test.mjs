import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const astroConfigPath = new URL("../astro.config.mjs", import.meta.url);
const middlewarePath = new URL("../src/middleware.ts", import.meta.url);

test("server config disables Astro default origin check in favor of custom internal-api origin guard", async () => {
  const [astroConfigSource, middlewareSource] = await Promise.all([
    readFile(astroConfigPath, "utf8"),
    readFile(middlewarePath, "utf8"),
  ]);

  assert.match(astroConfigSource, /security:\s*\{[\s\S]*checkOrigin:\s*false[\s\S]*\}/);
  assert.match(middlewareSource, /https:\/\/traceoflight\.dev/);
  assert.match(middlewareSource, /https:\/\/www\.traceoflight\.dev/);
  assert.match(middlewareSource, /Cross-site form submissions are forbidden/);
  assert.match(middlewareSource, /pathname\.startsWith\("\/internal-api"\)/);
});
