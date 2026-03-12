import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const formatDatePath = new URL("../src/lib/format-date.ts", import.meta.url);

test("shared date formatter fixes timezone for stable server-client rendering", async () => {
  const source = await readFile(formatDatePath, "utf8");

  assert.match(source, /new Intl\.DateTimeFormat\("en-US", \{/);
  assert.match(source, /timeZone:\s*"UTC"/);
});
