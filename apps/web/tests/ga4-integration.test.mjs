import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const baseHeadPath = new URL(
  "../src/components/BaseHead.astro",
  import.meta.url,
);
const visitorSummaryPath = new URL(
  "../src/lib/server/ga4-summary.ts",
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
  assert.match(envExample, /^GA4_PROPERTY_ID=/m);
  assert.match(envExample, /^GA4_SERVICE_ACCOUNT_JSON=/m);
  assert.match(envExample, /^GA4_VISITOR_TOTAL_START_DATE=/m);
  assert.match(envExample, /^GA4_VISITOR_CACHE_TTL_SECONDS=/m);
  assert.match(readme, /GA4_MEASUREMENT_ID/);
  assert.match(readme, /GA4_REPORTS_URL/);
  assert.match(readme, /GA4_PROPERTY_ID/);
  assert.match(readme, /GA4_SERVICE_ACCOUNT_JSON/);
  assert.match(readme, /GA4_VISITOR_TOTAL_START_DATE/);
  assert.match(readme, /GA4_VISITOR_CACHE_TTL_SECONDS/);
});

test("server ga4 summary helper uses data api totalUsers with cache and env validation", async () => {
  const source = await readFile(visitorSummaryPath, "utf8");

  assert.match(source, /@google-analytics\/data/);
  assert.match(source, /BetaAnalyticsDataClient/);
  assert.match(source, /GA4_PROPERTY_ID/);
  assert.match(source, /GA4_SERVICE_ACCOUNT_JSON/);
  assert.match(source, /GA4_VISITOR_TOTAL_START_DATE/);
  assert.match(source, /GA4_VISITOR_CACHE_TTL_SECONDS/);
  assert.match(source, /totalUsers/);
  assert.match(source, /today/);
  assert.match(source, /export type VisitorSummary/);
  assert.match(source, /getGa4VisitorSummary/);
  assert.match(source, /cachedSummary/);
});
