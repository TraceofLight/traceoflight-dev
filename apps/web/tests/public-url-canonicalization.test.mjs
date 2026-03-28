import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const appRootPath = fileURLToPath(new URL("..", import.meta.url));
const publicUrlModulePath = fileURLToPath(
  new URL("../src/lib/public-url.ts", import.meta.url),
);
const tsxLoaderPath = pathToFileURL(
  fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
).href;

async function invokePublicUrlModule({
  configuredSiteUrl = "",
  requestUrl,
}) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--import",
      tsxLoaderPath,
      "--input-type=module",
      "-e",
      `
        import { pathToFileURL } from "node:url";

        const publicUrlModule = await import(pathToFileURL(process.env.PUBLIC_URL_MODULE_PATH).href);
        const preferredOrigin = publicUrlModule.resolvePublicSiteOrigin(process.env.CONFIGURED_SITE_URL || undefined);
        const redirectUrl = publicUrlModule.buildPublicCanonicalUrl(
          new URL(process.env.REQUEST_URL),
          preferredOrigin,
        );

        console.log(JSON.stringify({
          preferredOrigin: preferredOrigin.toString(),
          redirectUrl: redirectUrl?.toString() ?? null,
          canonicalPathname: publicUrlModule.canonicalizePublicPath(
            new URL(process.env.REQUEST_URL).pathname,
          ),
        }));
      `,
    ],
    {
      cwd: appRootPath,
      env: {
        ...process.env,
        CONFIGURED_SITE_URL: configuredSiteUrl,
        PUBLIC_URL_MODULE_PATH: publicUrlModulePath,
        REQUEST_URL: requestUrl,
      },
    },
  );

  return JSON.parse(stdout.trim());
}

test("public url helpers prefer the www production origin over localhost env values", async () => {
  const result = await invokePublicUrlModule({
    configuredSiteUrl: "http://localhost:4321",
    requestUrl: "https://traceoflight.dev/blog/",
  });

  assert.equal(result.preferredOrigin, "https://www.traceoflight.dev/");
  assert.equal(result.redirectUrl, "https://www.traceoflight.dev/blog");
});

test("public url helpers add a trailing slash to blog detail urls", async () => {
  const result = await invokePublicUrlModule({
    configuredSiteUrl: "https://www.traceoflight.dev",
    requestUrl: "https://www.traceoflight.dev/blog/42seoul-la-piscine",
  });

  assert.equal(result.canonicalPathname, "/blog/42seoul-la-piscine/");
  assert.equal(
    result.redirectUrl,
    "https://www.traceoflight.dev/blog/42seoul-la-piscine/",
  );
});

test("path redirects use the public origin even when the app sees a localhost host", async () => {
  const result = await invokePublicUrlModule({
    configuredSiteUrl: "https://www.traceoflight.dev",
    requestUrl: "https://localhost/blog/",
  });

  assert.equal(result.redirectUrl, "https://www.traceoflight.dev/blog");
});

test("canonical public urls do not redirect", async () => {
  const result = await invokePublicUrlModule({
    configuredSiteUrl: "https://www.traceoflight.dev",
    requestUrl: "https://www.traceoflight.dev/blog/42seoul-la-piscine/",
  });

  assert.equal(result.redirectUrl, null);
});
