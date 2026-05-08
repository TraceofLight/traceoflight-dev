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
const uiLibPath = new URL("../src/lib/ui/recipes.ts", import.meta.url);
const headerPath = new URL("../src/components/Header.astro", import.meta.url);
const baseHeadPath = new URL("../src/components/BaseHead.astro", import.meta.url);
const baseLayoutPath = new URL("../src/layouts/BaseLayout.astro", import.meta.url);
const floatingUtilityPath = new URL("../src/components/public/FloatingUtilityButtons.astro", import.meta.url);

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
  assert.match(tokensSource, /:root\[data-theme='dark'\]/);
  assert.match(tokensSource, /--background:\s*222 47% 7%/);
  assert.match(tokensSource, /--card:\s*222 38% 11%/);
  assert.match(baseSource, /html\[data-theme='dark'\] body \{/);
  assert.match(baseSource, /linear-gradient\(180deg,\s*#08111f 0%,\s*#0f172a 100%\)/);
  assert.match(baseSource, /html\[data-theme='dark'\] \.site-header-surface \{/);
  assert.match(baseSource, /html\[data-theme='dark'\] \.site-footer-surface \{/);
  assert.match(baseSource, /html\[data-theme='dark'\] \.site-footer-dock \{/);
  assert.match(baseSource, /html\[data-theme='light'\] \.theme-invert-on-light \{/);
  assert.match(baseSource, /filter:\s*brightness\(0\) saturate\(100%\)/);
  assert.doesNotMatch(baseSource, /html\[data-theme='dark'\] header \{/);
  assert.match(baseSource, /\.hljs-keyword/);
  assert.match(baseSource, /\.hljs-string/);
});

test("dialog, alert dialog, and sheet use solid light surfaces instead of dark translucent chrome", async () => {
  const [dialogSource, alertSource, sheetSource, uiLibSource] = await Promise.all([
    readFile(dialogPath, "utf8"),
    readFile(alertDialogPath, "utf8"),
    readFile(sheetPath, "utf8"),
    readFile(uiLibPath, "utf8"),
  ]);

  // The overlay recipe in ui/recipes.ts defines modal-overlay and modal-surface.
  assert.match(uiLibSource, /["']modal-overlay["']/);
  assert.match(uiLibSource, /["']modal-surface["']/);

  for (const source of [dialogSource, alertSource, sheetSource]) {
    assert.doesNotMatch(source, /bg-black\/80/);
    assert.match(source, /overlay\(\{[^}]*kind:\s*["']modal-overlay["']|overlay\(\{[^}]*kind:\s*["']modal-surface["']/);
  }
});

test("button, input, and select primitives adopt the brighter toss-like shell", async () => {
  const [buttonSource, inputSource, selectSource, uiLibSource] = await Promise.all([
    readFile(buttonPath, "utf8"),
    readFile(inputPath, "utf8"),
    readFile(selectPath, "utf8"),
    readFile(uiLibPath, "utf8"),
  ]);

  // button.tsx now delegates to the action() recipe; the actual rounded-full
  // is defined in ui/recipes.ts. Assert the shim uses action().
  assert.match(buttonSource, /import \{[\s\S]*action[\s\S]*\} from "@\/lib\/ui\/recipes"/);
  assert.match(buttonSource, /action\(\{[^}]*variant:\s*recipeVariant/);
  assert.doesNotMatch(buttonSource, /rounded-md/);

  // The field recipe (not a static constant) drives input and select styling now.
  assert.match(uiLibSource, /["']input["'][\s\S]*rounded-2xl|rounded-2xl[\s\S]*["']input["']/);
  assert.match(inputSource, /field\(\{[^}]*kind:\s*["']input["']/);

  assert.match(selectSource, /field\(\{[^}]*kind:\s*["']input["']|overlay\(\{[^}]*kind:\s*["']popover["']/);
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

test("base head and base layout provide a persistent global theme toggle in a floating utility dock", async () => {
  const [baseHeadSource, headerSource, baseLayoutSource, floatingUtilitySource] = await Promise.all([
    readFile(baseHeadPath, "utf8"),
    readFile(headerPath, "utf8"),
    readFile(baseLayoutPath, "utf8"),
    readFile(floatingUtilityPath, "utf8"),
  ]);

  assert.match(baseHeadSource, /document\.documentElement\.dataset\.theme/);
  assert.match(baseHeadSource, /const storageKey = "traceoflight-theme";/);
  assert.match(baseHeadSource, /localStorage\.getItem\(storageKey\)/);
  assert.match(baseHeadSource, /const applyTheme = \(\) => \{/);
  assert.match(baseHeadSource, /document\.addEventListener\("astro:after-swap", applyTheme\)/);
  assert.match(baseHeadSource, /document\.addEventListener\("astro:page-load", applyTheme\)/);
  assert.match(baseHeadSource, /window\.matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(headerSource, /site-header-surface/);
  assert.doesNotMatch(headerSource, /ThemeToggle/);
  // FloatingUtilityButtons migrated from React to a static Astro component
  // (no React hydration); the theme toggle is now inlined into the same file.
  assert.match(
    baseLayoutSource,
    /import FloatingUtilityButtons from ['"]\.\.\/components\/public\/FloatingUtilityButtons\.astro['"];/,
  );
  assert.match(baseLayoutSource, /<Footer visitorSummary=\{visitorSummary\} \/>/);
  assert.match(baseLayoutSource, /<FloatingUtilityButtons \/>/);
  assert.match(floatingUtilitySource, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(floatingUtilitySource, /data-theme-toggle/);
  assert.match(floatingUtilitySource, /traceoflight-theme/);
  assert.doesNotMatch(floatingUtilitySource, /Powered by TraceofLight/);
});

test("theme toggle keeps visible secondary icons, symmetric thumb travel, and softer light-mode chrome", async () => {
  // The toggle is now inlined into FloatingUtilityButtons.astro. The visual
  // styling lives in that component's <style> block, keyed off the
  // :root[data-theme='dark'] selector.
  const source = await readFile(floatingUtilityPath, "utf8");

  assert.match(source, /w-\[5\.25rem\]/);
  assert.match(source, /justify-between px-2\.5/);
  // Light-mode chrome
  assert.match(source, /rgba\(226,\s*232,\s*240,\s*0\.8\)/);
  assert.match(source, /rgba\(255,\s*255,\s*255,\s*0\.86\)/);
  // Dark-mode thumb travel uses 2.5rem (matches translate-x-10 in tailwind).
  assert.match(source, /translateX\(2\.5rem\)/);
  // Both rail icons remain visible (left = sun, right = moon-star).
  assert.match(source, /floating-theme-rail-icon/);
});
