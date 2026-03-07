import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { formatReadingTimeLabel } from "../src/lib/reading-time.ts";

const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);

test("reading time helper calculates body-based standard min read label", () => {
  const body = Array.from({ length: 400 }, () => "word").join(" ");

  assert.equal(formatReadingTimeLabel(body), "2 min read");
  assert.equal(formatReadingTimeLabel("short"), "1 min read");
});

test("post card uses reading-time helper instead of title-and-excerpt minute text", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /formatReadingTimeLabel/);
  assert.match(source, /\{readingLabel\}/);
  assert.match(source, /text-xs text-muted-foreground/);
  assert.doesNotMatch(source, /post-card-archive-meta/);
  assert.doesNotMatch(source, /약 \{readingMinutes\}분/);
  assert.doesNotMatch(source, /`\$\{post\.title\} \$\{descriptionText\}`/);
});
