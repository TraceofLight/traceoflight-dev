import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const middlewarePath = new URL("../src/middleware.ts", import.meta.url);

test("analytics page-view endpoint is exempted from admin-token gating", async () => {
  // Anonymous visitors must reach this endpoint or GA4 ingestion silently
  // dies (the protected-path branch returns 401 before the route handler).
  const source = await readFile(middlewarePath, "utf8");

  assert.match(
    source,
    /isPublicPath[\s\S]*\/internal-api\/analytics\/event[\s\S]*return\s+true/,
  );
  // The CSRF/Origin form-submission guard still applies above.
  assert.match(source, /Cross-site form submissions are forbidden/);
});
