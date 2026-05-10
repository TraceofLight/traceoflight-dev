import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const headerPath = new URL("../src/components/Header.astro", import.meta.url);
const baseLayoutPath = new URL("../src/layouts/BaseLayout.astro", import.meta.url);
const pageTransitionsPath = new URL(
  "../src/components/PageTransitions.astro",
  import.meta.url,
);
const pageTransitionStylesPath = new URL(
  "../src/lib/page-transition.ts",
  import.meta.url,
);

test("page transitions keep the sticky header above swapped page content", async () => {
  const [headerSource, layoutSource, transitionsSource, transitionStylesSource] =
    await Promise.all([
      readFile(headerPath, "utf8"),
      readFile(baseLayoutPath, "utf8"),
      readFile(pageTransitionsPath, "utf8"),
      readFile(pageTransitionStylesPath, "utf8"),
    ]);

  assert.match(
    headerSource,
    /<header[\s\S]*transition:name="site-header"[\s\S]*sticky top-0/,
  );
  assert.match(
    layoutSource,
    /<main[\s\S]*transition:name="page-content"/,
  );
  assert.match(transitionsSource, /contentName:\s*['"]page-content['"]/);
  assert.match(transitionsSource, /headerName:\s*['"]site-header['"]/);
  assert.match(
    transitionStylesSource,
    /::view-transition-group\(\$\{contentName\}\)\s*\{[\s\S]*z-index:\s*10/,
  );
  assert.match(
    transitionStylesSource,
    /::view-transition-group\(\$\{headerName\}\)\s*\{[\s\S]*z-index:\s*20/,
  );
});
