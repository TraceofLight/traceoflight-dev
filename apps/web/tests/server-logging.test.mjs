import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const webRoot = new URL("..", import.meta.url);
const loggerPath = new URL("../src/lib/server/logging.ts", import.meta.url);
const backendApiPath = new URL("../src/lib/backend-api.ts", import.meta.url);
const adminAuthPath = new URL("../src/lib/admin-auth.ts", import.meta.url);
const middlewarePath = new URL("../src/middleware.ts", import.meta.url);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const projectsPath = new URL("../src/lib/projects.ts", import.meta.url);
const seriesDbPath = new URL("../src/lib/series-db.ts", import.meta.url);
const postCommentsPath = new URL(
  "../src/lib/post-comments.ts",
  import.meta.url,
);
const proxyHelpersPath = new URL(
  "../src/lib/server/proxy-helpers.ts",
  import.meta.url,
);
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
const sitemapRoutePath = new URL(
  "../src/pages/sitemap.xml.ts",
  import.meta.url,
);
const paginatePath = new URL("../src/lib/paginate.ts", import.meta.url);
const ga4SummaryPath = new URL(
  "../src/lib/server/ga4-summary.ts",
  import.meta.url,
);
const analyticsEventPath = new URL(
  "../src/pages/internal-api/analytics/event.ts",
  import.meta.url,
);
const browserImagePath = new URL(
  "../src/pages/internal-api/media/browser-image.ts",
  import.meta.url,
);
const mediaUploadUrlPath = new URL(
  "../src/pages/internal-api/media/upload-url.ts",
  import.meta.url,
);
const mediaRegisterPath = new URL(
  "../src/pages/internal-api/media/register.ts",
  import.meta.url,
);
const mediaUploadProxyPath = new URL(
  "../src/pages/internal-api/media/upload-proxy.ts",
  import.meta.url,
);

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

test("frontend server boundaries declare debug log events", async () => {
  const sourceByName = {
    backendApi: await readFile(backendApiPath, "utf8"),
    adminAuth: await readFile(adminAuthPath, "utf8"),
    middleware: await readFile(middlewarePath, "utf8"),
    blogDb: await readFile(blogDbPath, "utf8"),
    projects: await readFile(projectsPath, "utf8"),
    seriesDb: await readFile(seriesDbPath, "utf8"),
    postComments: await readFile(postCommentsPath, "utf8"),
    proxyHelpers: await readFile(proxyHelpersPath, "utf8"),
    loginRoute: await readFile(loginRoutePath, "utf8"),
    refreshRoute: await readFile(refreshRoutePath, "utf8"),
    logoutLib: await readFile(logoutLibPath, "utf8"),
    localizedRssRoute: await readFile(localizedRssRoutePath, "utf8"),
    sitemapRoute: await readFile(sitemapRoutePath, "utf8"),
    paginate: await readFile(paginatePath, "utf8"),
    ga4Summary: await readFile(ga4SummaryPath, "utf8"),
    analyticsEvent: await readFile(analyticsEventPath, "utf8"),
    browserImage: await readFile(browserImagePath, "utf8"),
    mediaUploadUrl: await readFile(mediaUploadUrlPath, "utf8"),
    mediaRegister: await readFile(mediaRegisterPath, "utf8"),
    mediaUploadProxy: await readFile(mediaUploadProxyPath, "utf8"),
  };

  const expectedEvents = {
    backendApi: ["backend.request_started", "backend.response_received"],
    adminAuth: [
      "admin.credential_revision_cache_hit",
      "admin.credential_revision_loaded",
      "admin.credentials_verify_requested",
      "admin.access_token_verified",
      "admin.refresh_rotation_resolved",
      "admin.logout_revocation_requested",
    ],
    middleware: [
      "middleware.request_started",
      "middleware.canonical_redirected",
      "middleware.locale_cookie_synced",
      "middleware.auth_checked",
      "middleware.request_allowed",
      "admin.session_refresh_stale",
    ],
    blogDb: [
      "blog.list_requested",
      "blog.list_returned",
      "blog.summary_page_requested",
      "blog.summary_page_returned",
      "blog.detail_requested",
      "blog.detail_returned",
      "blog.redirect_requested",
      "blog.redirect_resolved",
    ],
    projects: [
      "project.list_requested",
      "project.list_returned",
      "project.detail_requested",
      "project.detail_returned",
      "project.redirect_requested",
      "project.redirect_resolved",
    ],
    seriesDb: [
      "series.list_requested",
      "series.list_returned",
      "series.detail_requested",
      "series.detail_returned",
      "series.redirect_requested",
      "series.redirect_resolved",
    ],
    postComments: [
      "comment.thread_initial_requested",
      "comment.thread_initial_returned",
      "comment.thread_initial_failed",
    ],
    proxyHelpers: [
      "proxy.backend_unavailable_returned",
      "proxy.unauthorized_returned",
      "proxy.text_response_returned",
      "proxy.binary_response_returned",
    ],
    loginRoute: ["admin.login_requested"],
    refreshRoute: ["admin.refresh_requested"],
    logoutLib: ["admin.logout_requested"],
    localizedRssRoute: ["rss.feed_requested", "rss.feed_returned"],
    sitemapRoute: ["sitemap.entries_collected", "sitemap.generated"],
    paginate: ["pagination.page_requested", "pagination.completed"],
    ga4Summary: [
      "ga4.visitor_summary_cache_hit",
      "ga4.visitor_summary_skipped",
      "ga4.visitor_summary_fetched",
    ],
    analyticsEvent: ["analytics.event_skipped", "analytics.event_accepted"],
    browserImage: [
      "media.browser_image_requested",
      "media.browser_image_candidates_resolved",
      "media.browser_image_returned",
    ],
    mediaUploadUrl: [
      "media.upload_url_proxy_requested",
      "media.upload_url_proxy_returned",
    ],
    mediaRegister: [
      "media.register_proxy_requested",
      "media.register_proxy_returned",
    ],
    mediaUploadProxy: [
      "media.upload_proxy_rejected",
      "media.upload_proxy_forward_requested",
      "media.upload_proxy_forward_returned",
    ],
  };

  for (const [name, events] of Object.entries(expectedEvents)) {
    const source = sourceByName[name];
    for (const event of events) {
      assert.match(
        source,
        new RegExp(
          `serverLogger\\.debug\\(['"]${event.replaceAll(".", "\\.")}['"]`,
        ),
        `${name} missing debug event ${event}`,
      );
    }
  }

  const combined = Object.values(sourceByName).join("\n");
  for (const statement of combined.split("serverLogger.debug(").slice(1)) {
    const call = statement.split(");")[0] ?? statement;
    assert.doesNotMatch(
      call,
      /\b(password|authorization|cookie)\b|body\s*:/i,
      "debug logs should not include credentials, cookies, authorization, or request bodies",
    );
  }
});
