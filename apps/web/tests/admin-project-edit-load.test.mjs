import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const loadersPath = new URL(
  "../src/lib/admin/new-post-page/loaders.ts",
  import.meta.url,
);
const postsApiPath = new URL(
  "../src/lib/admin/new-post-page/posts-api.ts",
  import.meta.url,
);
const typesPath = new URL(
  "../src/lib/admin/new-post-page/types.ts",
  import.meta.url,
);

test("project edit loader falls back to project card image when cover is missing", async () => {
  const source = await readFile(loadersPath, "utf8");

  assert.match(
    source,
    /const resolvedCoverImageUrl\s*=\s*loaded\.cover_image_url\s*\?\?\s*loaded\.project_profile\?\.card_image_url\s*\?\?\s*["']/,
  );
  assert.match(source, /coverInput\.value = resolvedCoverImageUrl/);
  assert.match(
    source,
    /topMediaImageUrlInput\.value\s*=\s*[\s\S]*loaded\.top_media_image_url\s*\?\?\s*resolvedCoverImageUrl/,
  );
});

test("project payload normalization tolerates missing project card image", async () => {
  const [postsApiSource, typesSource] = await Promise.all([
    readFile(postsApiPath, "utf8"),
    readFile(typesPath, "utf8"),
  ]);

  assert.doesNotMatch(
    postsApiSource,
    /typeof value\.role_summary !== "string"\s*\|\|\s*typeof value\.card_image_url !== "string"/,
  );
  assert.match(
    postsApiSource,
    /card_image_url:\s*[\s\S]*typeof value\.card_image_url === "string" \|\| value\.card_image_url === null/,
  );
  assert.match(typesSource, /card_image_url\?: string \| null;/);
});
