import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const appRootPath = fileURLToPath(new URL("..", import.meta.url));
const routeModuleUrl = new URL("../src/pages/[indexnowKey].txt.ts", import.meta.url).href;
const tsxLoaderPath = pathToFileURL(
  fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
).href;

async function invokeKeyRoute({ envKey, requestedKey }) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--import",
      tsxLoaderPath,
      "--input-type=module",
      "-e",
      `
        const { GET } = await import(process.env.ROUTE_MODULE_URL);
        const response = await GET({
          params: { indexnowKey: process.env.REQUESTED_KEY },
          request: new Request("https://www.traceoflight.dev/" + process.env.REQUESTED_KEY + ".txt"),
        });
        console.log(JSON.stringify({
          status: response.status,
          contentType: response.headers.get("content-type"),
          body: await response.text(),
        }));
      `,
    ],
    {
      cwd: appRootPath,
      env: {
        ...process.env,
        ROUTE_MODULE_URL: routeModuleUrl,
        REQUESTED_KEY: requestedKey,
        INDEXNOW_KEY: envKey ?? "",
      },
    },
  );
  return JSON.parse(stdout.trim());
}

test("indexnow key file echoes the configured key when requested matches", async () => {
  const response = await invokeKeyRoute({
    envKey: "abc123def",
    requestedKey: "abc123def",
  });
  assert.equal(response.status, 200);
  assert.match(response.contentType, /text\/plain/);
  assert.equal(response.body, "abc123def");
});

test("indexnow key file returns 404 when requested key does not match env", async () => {
  const response = await invokeKeyRoute({
    envKey: "abc123def",
    requestedKey: "wrong-key",
  });
  assert.equal(response.status, 404);
});

test("indexnow key file returns 404 when env key is unset (feature disabled)", async () => {
  const response = await invokeKeyRoute({
    envKey: "",
    requestedKey: "anything",
  });
  assert.equal(response.status, 404);
});
