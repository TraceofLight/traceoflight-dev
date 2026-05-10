import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const webRoot = new URL("..", import.meta.url);
const loggerPath = new URL("../src/lib/server/logging.ts", import.meta.url);
const backendApiPath = new URL("../src/lib/backend-api.ts", import.meta.url);
const middlewarePath = new URL("../src/middleware.ts", import.meta.url);
const loginRoutePath = new URL(
  "../src/pages/internal-api/auth/login.ts",
  import.meta.url,
);
const refreshRoutePath = new URL(
  "../src/pages/internal-api/auth/refresh.ts",
  import.meta.url,
);
const logoutLibPath = new URL("../src/lib/admin-logout.ts", import.meta.url);
const localizedRssRoutePath = new URL(
  "../src/pages/[locale]/rss.xml.ts",
  import.meta.url,
);
const sitemapRoutePath = new URL("../src/pages/sitemap.xml.ts", import.meta.url);
const paginatePath = new URL("../src/lib/paginate.ts", import.meta.url);
const ga4SummaryPath = new URL("../src/lib/server/ga4-summary.ts", import.meta.url);

test("server logger emits structured JSON at the info threshold without sensitive fields", () => {
  const script = `
    import { createServerLogger } from ${JSON.stringify(loggerPath.href)};

    const calls = [];
    const print = console.log;
    console.info = (line) => calls.push(["info", JSON.parse(line)]);
    console.warn = (line) => calls.push(["warn", JSON.parse(line)]);
    console.error = (line) => calls.push(["error", JSON.parse(line)]);

    const logger = createServerLogger("info");
    logger.debug("debug.hidden", { path: "/admin" });
    logger.info("test.info", {
      path: "/admin",
      duration_ms: 12,
      password: "hidden",
      token: "hidden",
      error: new Error("boom"),
    });
    logger.warn("test.warn", {
      ok: true,
      retry_after_seconds: undefined,
    });

    print(JSON.stringify(calls));
  `;

  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", script],
    {
      cwd: webRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);

  const calls = JSON.parse(result.stdout.trim());
  assert.deepEqual(
    calls.map(([method]) => method),
    ["info", "warn"],
  );

  const infoPayload = calls[0][1];
  assert.equal(infoPayload.level, "info");
  assert.equal(infoPayload.event, "test.info");
  assert.equal(infoPayload.path, "/admin");
  assert.equal(infoPayload.duration_ms, 12);
  assert.equal(typeof infoPayload.timestamp, "string");
  assert.equal("password" in infoPayload, false);
  assert.equal("token" in infoPayload, false);
  assert.deepEqual(infoPayload.error, { name: "Error", message: "boom" });

  const warnPayload = calls[1][1];
  assert.equal(warnPayload.level, "warn");
  assert.equal(warnPayload.event, "test.warn");
  assert.equal(warnPayload.ok, true);
  assert.equal("retry_after_seconds" in warnPayload, false);
});

test("frontend server boundaries declare operational log events", async () => {
  const [
    backendApiSource,
    middlewareSource,
    loginRouteSource,
    refreshRouteSource,
    logoutLibSource,
    localizedRssRouteSource,
    sitemapRouteSource,
    paginateSource,
    ga4SummarySource,
  ] = await Promise.all([
    readFile(backendApiPath, "utf8"),
    readFile(middlewarePath, "utf8"),
    readFile(loginRoutePath, "utf8"),
    readFile(refreshRoutePath, "utf8"),
    readFile(logoutLibPath, "utf8"),
    readFile(localizedRssRoutePath, "utf8"),
    readFile(sitemapRoutePath, "utf8"),
    readFile(paginatePath, "utf8"),
    readFile(ga4SummaryPath, "utf8"),
  ]);

  assert.match(
    backendApiSource,
    /serverLogger\.info\("backend\.request_completed"/,
  );
  assert.match(
    backendApiSource,
    /serverLogger\.warn\("backend\.response_non_ok"/,
  );
  assert.match(
    backendApiSource,
    /serverLogger\.warn\("backend\.request_failed"/,
  );
  assert.match(backendApiSource, /duration_ms/);
  assert.match(backendApiSource, /include_internal_secret/);
  assert.match(backendApiSource, /cache_mode/);

  assert.match(
    middlewareSource,
    /serverLogger\.warn\("security\.csrf_blocked"/,
  );
  assert.match(
    middlewareSource,
    /serverLogger\.info\("admin\.session_refresh_rotated"/,
  );
  assert.match(
    middlewareSource,
    /serverLogger\.warn\("admin\.session_refresh_failed"/,
  );
  assert.match(
    middlewareSource,
    /serverLogger\.warn\("admin\.internal_api_unauthorized"/,
  );
  assert.match(
    middlewareSource,
    /serverLogger\.info\("admin\.login_redirected"/,
  );

  assert.match(
    loginRouteSource,
    /serverLogger\.info\("admin\.login_succeeded"/,
  );
  assert.match(loginRouteSource, /serverLogger\.warn\("admin\.login_failed"/);
  assert.match(
    loginRouteSource,
    /serverLogger\.warn\("admin\.login_throttled"/,
  );
  assert.match(
    loginRouteSource,
    /serverLogger\.warn\("admin\.auth_not_configured"/,
  );
  assert.match(
    loginRouteSource,
    /serverLogger\.warn\("admin\.login_invalid_json"/,
  );

  assert.match(
    refreshRouteSource,
    /serverLogger\.info\("admin\.refresh_succeeded"/,
  );
  assert.match(
    refreshRouteSource,
    /serverLogger\.warn\("admin\.refresh_failed"/,
  );

  assert.match(
    logoutLibSource,
    /serverLogger\.info\("admin\.logout_completed"/,
  );
  assert.match(
    localizedRssRouteSource,
    /serverLogger\.warn\("rss\.posts_fetch_failed"/,
  );
  assert.match(
    sitemapRouteSource,
    /serverLogger\.warn\("sitemap\.posts_fetch_failed"/,
  );
  assert.match(
    paginateSource,
    /serverLogger\.warn\("pagination\.page_fetch_failed"/,
  );
  assert.match(
    ga4SummarySource,
    /serverLogger\.warn\("ga4\.visitor_summary_failed"/,
  );

  for (const source of [
    backendApiSource,
    middlewareSource,
    loginRouteSource,
    refreshRouteSource,
    logoutLibSource,
    localizedRssRouteSource,
    sitemapRouteSource,
    paginateSource,
    ga4SummarySource,
  ]) {
    assert.doesNotMatch(
      source,
      /serverLogger\.(?:info|warn|error)\([^;]*(?:password|token|cookie|authorization)/i,
    );
  }

  for (const source of [
    localizedRssRouteSource,
    sitemapRouteSource,
    paginateSource,
    ga4SummarySource,
  ]) {
    assert.doesNotMatch(source, /console\.error/);
  }
});
