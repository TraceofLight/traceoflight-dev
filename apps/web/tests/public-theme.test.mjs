import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { readCssModule } from "./helpers/read-css-module.mjs";

const tokensPath = new URL("../src/styles/tokens.css", import.meta.url);
const baseCssPath = new URL("../src/styles/base.css", import.meta.url);
const buttonPath = new URL("../src/components/ui/button.tsx", import.meta.url);
const inputPath = new URL("../src/components/ui/input.tsx", import.meta.url);
const selectPath = new URL("../src/components/ui/select.tsx", import.meta.url);
const dialogPath = new URL("../src/components/ui/dialog.tsx", import.meta.url);
const alertDialogPath = new URL(
  "../src/components/ui/alert-dialog.tsx",
  import.meta.url,
);
const sheetPath = new URL("../src/components/ui/sheet.tsx", import.meta.url);
const writerCssPath = new URL(
  "../src/styles/components/writer.css",
  import.meta.url,
);

test("public theme tokens move the site to a bright toss-like blue-gray palette", async () => {
  const [tokensSource, baseSource] = await Promise.all([
    readFile(tokensPath, "utf8"),
    readFile(baseCssPath, "utf8"),
  ]);

  assert.match(tokensSource, /--background:\s*210 40% 98%/);
  assert.match(tokensSource, /--primary:\s*212 100% 59%/);
  assert.match(tokensSource, /--muted:\s*210 40% 96%/);
  assert.match(tokensSource, /--radius:\s*1\.5rem/);
  assert.doesNotMatch(tokensSource, /--bg-app:\s*#0b111a/);
  assert.doesNotMatch(tokensSource, /--brand:\s*#36d293/);

  assert.match(baseSource, /linear-gradient\(180deg,\s*#f6f9fc 0%,\s*#eef4ff 100%\)/);
  assert.doesNotMatch(baseSource, /#081019/);
  assert.doesNotMatch(baseSource, /#0e1724/);
});

test("dialog, alert dialog, and sheet use solid light surfaces instead of dark translucent chrome", async () => {
  const [dialogSource, alertSource, sheetSource] = await Promise.all([
    readFile(dialogPath, "utf8"),
    readFile(alertDialogPath, "utf8"),
    readFile(sheetPath, "utf8"),
  ]);

  for (const source of [dialogSource, alertSource, sheetSource]) {
    assert.doesNotMatch(source, /bg-black\/80/);
    assert.match(source, /backdrop-blur/);
    assert.match(source, /bg-white\/95/);
    assert.match(source, /border-white\/70/);
    assert.match(source, /shadow-\[0_32px_80px_rgba\(15,23,42,0\.18\)\]/);
  }
});

test("button, input, and select primitives adopt the brighter toss-like shell", async () => {
  const [buttonSource, inputSource, selectSource] = await Promise.all([
    readFile(buttonPath, "utf8"),
    readFile(inputPath, "utf8"),
    readFile(selectPath, "utf8"),
  ]);

  assert.match(buttonSource, /rounded-full/);
  assert.match(buttonSource, /shadow-\[0_10px_30px_rgba\(49,130,246,0\.22\)\]/);
  assert.match(buttonSource, /bg-white\/88/);
  assert.doesNotMatch(buttonSource, /rounded-md/);

  assert.match(inputSource, /rounded-2xl/);
  assert.match(inputSource, /bg-white\/92/);
  assert.match(inputSource, /border-white\/80/);

  assert.match(selectSource, /rounded-2xl/);
  assert.match(selectSource, /bg-white\/92/);
  assert.match(selectSource, /border-white\/80/);
});

test("writer styles reuse the shared light theme language instead of a separate green accent palette", async () => {
  const source = await readCssModule(writerCssPath);

  assert.match(source, /var\(--writer-page-bg\)/);
  assert.match(source, /var\(--writer-surface\)/);
  assert.match(source, /var\(--writer-primary\)/);
  assert.match(source, /var\(--writer-border\)/);
  assert.doesNotMatch(source, /#13c08a/);
  assert.doesNotMatch(source, /#10b17f/);
  assert.doesNotMatch(source, /#1ab889/);
});
