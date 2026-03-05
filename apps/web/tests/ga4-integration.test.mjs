import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const baseHeadPath = new URL(
  "../src/components/BaseHead.astro",
  import.meta.url,
);
const envExamplePath = new URL("../.env.example", import.meta.url);
const readmePath = new URL("../README.md", import.meta.url);

test("base head provides optional GA4 snippet with astro page-load tracking", async () => {
  const source = await readFile(baseHeadPath, "utf8");

  assert.match(source, /GA4_MEASUREMENT_ID/);
  assert.match(source, /googletagmanager\.com\/gtag\/js\?id=/);
  assert.match(source, /send_page_view:\s*false/);
  assert.match(source, /astro:page-load/);
  assert.match(source, /page_location/);
});

test("env example and readme document GA4 configuration variables", async () => {
  const [envExample, readme] = await Promise.all([
    readFile(envExamplePath, "utf8"),
    readFile(readmePath, "utf8"),
  ]);

  assert.match(envExample, /^GA4_MEASUREMENT_ID=/m);
  assert.match(envExample, /^GA4_REPORTS_URL=/m);
  assert.match(readme, /GA4_MEASUREMENT_ID/);
  assert.match(readme, /GA4_REPORTS_URL/);
});
