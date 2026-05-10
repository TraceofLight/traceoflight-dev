import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogPostLayoutPath = new URL(
  "../src/layouts/BlogPost.astro",
  import.meta.url,
);
const projectDetailPath = new URL(
  "../src/pages/[locale]/projects/[slug].astro",
  import.meta.url,
);
const markdownRendererPath = new URL(
  "../src/lib/markdown-renderer-core.ts",
  import.meta.url,
);
const mediaScriptPath = new URL(
  "../src/scripts/image-fallback.ts",
  import.meta.url,
);
const baseCssPath = new URL("../src/styles/base.css", import.meta.url);

test("public media renders through a shared loading frame for images, videos, and embeds", async () => {
  const [layoutSource, projectSource, markdownSource, scriptSource, cssSource] =
    await Promise.all([
      readFile(blogPostLayoutPath, "utf8"),
      readFile(projectDetailPath, "utf8"),
      readFile(markdownRendererPath, "utf8"),
      readFile(mediaScriptPath, "utf8"),
      readFile(baseCssPath, "utf8"),
    ]);

  assert.match(layoutSource, /data-media-shell/);
  assert.match(layoutSource, /<video[\s\S]*data-media-load/);
  assert.match(layoutSource, /<iframe[\s\S]*data-media-load/);
  assert.match(layoutSource, /<CoverMediaImage[\s\S]*mediaLoad/);

  assert.match(projectSource, /data-media-shell/);
  assert.match(projectSource, /<video[\s\S]*data-media-load/);
  assert.match(projectSource, /<iframe[\s\S]*data-media-load/);
  assert.match(projectSource, /<img[\s\S]*data-media-load/);

  assert.match(markdownSource, /media-load-frame/);
  assert.match(markdownSource, /data-media-shell/);
  assert.match(markdownSource, /data-media-load/);
  assert.match(markdownSource, /md-media-fallback/);

  assert.match(scriptSource, /img\[data-media-load\]/);
  assert.match(scriptSource, /video\[data-media-load\]/);
  assert.match(scriptSource, /iframe\[data-media-load\]/);
  assert.match(scriptSource, /loadedmetadata/);
  assert.match(scriptSource, /mediaState/);

  assert.match(cssSource, /\.media-load-frame/);
  assert.match(cssSource, /data-media-state=["']loading["']/);
  assert.match(cssSource, /data-media-state=["']loaded["']/);
  assert.match(cssSource, /data-media-state=["']error["']/);
});
