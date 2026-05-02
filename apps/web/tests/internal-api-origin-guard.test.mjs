import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const astroConfigPath = new URL("../astro.config.mjs", import.meta.url);
const middlewarePath = new URL("../src/middleware.ts", import.meta.url);

test("server config disables Astro default origin check in favor of custom internal-api origin guard", async () => {
  const constsPath = new URL("../src/consts.ts", import.meta.url);
  const [astroConfigSource, middlewareSource, constsSource] = await Promise.all([
    readFile(astroConfigPath, "utf8"),
    readFile(middlewarePath, "utf8"),
    readFile(constsPath, "utf8"),
  ]);

  assert.match(astroConfigSource, /security:\s*\{[\s\S]*checkOrigin:\s*false[\s\S]*\}/);
  // Origins now live in consts.ts as INTERNAL_API_ORIGIN_HOSTS, and the
  // middleware imports them.
  assert.match(constsSource, /https:\/\/traceoflight\.dev/);
  assert.match(constsSource, /https:\/\/www\.traceoflight\.dev/);
  assert.match(middlewareSource, /INTERNAL_API_ORIGIN_HOSTS/);
  assert.match(middlewareSource, /Cross-site form submissions are forbidden/);
  assert.match(middlewareSource, /pathname\.startsWith\("\/internal-api"\)/);
});
