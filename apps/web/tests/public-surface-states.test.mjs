import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const headerPath = new URL("../src/components/Header.astro", import.meta.url);
const headerLinkPath = new URL(
  "../src/components/HeaderLink.astro",
  import.meta.url,
);
const footerPath = new URL("../src/components/Footer.astro", import.meta.url);
const footerIconLinkPath = new URL(
  "../src/components/FooterIconLink.astro",
  import.meta.url,
);
const footerAdminModalPath = new URL(
  "../src/components/public/FooterAdminModal.astro",
  import.meta.url,
);
const mobileNavSheetPath = new URL(
  "../src/components/public/MobileNavSheet.astro",
  import.meta.url,
);
const homePagePath = new URL("../src/pages/[locale]/index.astro", import.meta.url);
const projectCardPath = new URL(
  "../src/components/ProjectCard.astro",
  import.meta.url,
);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);
const inputPath = new URL("../src/components/ui/input.tsx", import.meta.url);
const selectPath = new URL("../src/components/ui/select.tsx", import.meta.url);
const dialogPath = new URL("../src/components/ui/dialog.tsx", import.meta.url);
const sheetPath = new URL("../src/components/ui/sheet.tsx", import.meta.url);
const alertDialogPath = new URL(
  "../src/components/ui/alert-dialog.tsx",
  import.meta.url,
);

test("header navigation keeps active and hover states without a heavy shared rail", async () => {
  const [headerSource, headerLinkSource] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(headerLinkPath, "utf8"),
  ]);

  assert.match(headerSource, /class="text-base font-semibold tracking-tight text-foreground"/);
  assert.doesNotMatch(headerSource, /bg-white\/88 px-4 py-2/);
  assert.match(headerSource, /class="hidden items-center gap-1 md:flex"/);
  assert.match(headerSource, /<form class="flex" method="GET" action=\{ADMIN_IMPORTS_PATH\}>/);
  assert.match(headerSource, /<form class="flex" method="POST" action="\/logout\?next=\/">/);
  assert.match(headerSource, /import \{[\s\S]*action[\s\S]*\} from "\.\.\/lib\/ui";/);
  assert.match(
    headerSource,
    /id="header-admin-link"[\s\S]*class=\{action\(\{[^}]*variant:\s*["']dangerOutline["']/,
  );
  assert.match(
    headerSource,
    /id="header-admin-logout"[\s\S]*class=\{action\(\{[^}]*variant:\s*["']dangerOutline["']/,
  );
  assert.doesNotMatch(headerSource, /rounded-full border border-white\/70 bg-white\/72 p-1\.5/);
  assert.match(headerLinkSource, /select-none/);
  // HeaderLink now inlines the active highlight class directly (no import from ui-effects).
  assert.match(headerLinkSource, /border border-surface-border bg-surface text-foreground shadow-pill/);
  assert.match(headerLinkSource, /hover:bg-surface-strong/);
});

test("footer icons use the same filled pill treatment as the admin entry button", async () => {
  const [footerSource, footerIconSource, footerAdminModalSource] = await Promise.all([
    readFile(footerPath, "utf8"),
    readFile(footerIconLinkPath, "utf8"),
    readFile(footerAdminModalPath, "utf8"),
  ]);

  assert.match(
    footerSource,
    /class="site-footer-dock flex items-center gap-3 rounded-full border border-surface-border bg-surface px-3 py-2 shadow-card"/,
  );
  assert.match(
    footerSource,
    /<div class="space-y-1">[\s\S]*Today \{visitorSummary\.todayVisitors\} \/ Total \{visitorSummary\.totalVisitors\}[\s\S]*<\/div>/,
  );
  assert.match(footerIconSource, /import \{[\s\S]*action[\s\S]*\} from "\.\.\/lib\/ui";/);
  assert.match(footerIconSource, /class=\{action\(\{[^}]*variant:\s*["']surface["'][^}]*size:\s*["']icon["']/);
  // FooterAdminModal is now an Astro component using class= and imports action from ../../lib/ui.
  assert.match(footerAdminModalSource, /import \{[\s\S]*action[\s\S]*\} from "\.\.\/\.\.\/lib\/ui";/);
  assert.match(footerAdminModalSource, /action\(\{[^}]*variant:\s*["']surface["'][^}]*size:\s*["']icon["']/);
  assert.match(footerAdminModalSource, /type="button"/);
  assert.match(footerSource, /class="site-footer-surface border-t border-white\/60 bg-white\/72 backdrop-blur-xl"/);
});

test("mobile navigation sheet stays compact and drops redundant title copy", async () => {
  const source = await readFile(mobileNavSheetPath, "utf8");

  // Now a native <dialog> right-side panel sized at min(22rem, calc(100vw - 1.5rem)).
  assert.match(source, /<dialog[\s\S]*data-mobile-nav-sheet/);
  assert.match(source, /min\(22rem,\s*calc\(100vw\s*-\s*1\.5rem\)\)/);
  assert.doesNotMatch(source, /<SheetHeader>/);
  assert.doesNotMatch(source, /<SheetTitle>/);
  assert.doesNotMatch(source, /<SheetDescription>/);
  assert.doesNotMatch(source, /Navigate/);
  assert.doesNotMatch(source, /Move across the public site\./);
  // Astro uses class= rather than className=.
  assert.match(source, /class="mt-2 flex flex-col gap-1\.5"/);
  assert.match(source, /rounded-2xl px-4 py-3 text-base/);
  assert.match(source, /ADMIN_IMPORTS_PATH/);
  assert.match(source, /href=\{ADMIN_IMPORTS_PATH\}/);
});

test("home sections and content cards use solid white surfaces with stronger hover lift", async () => {
  const [homeSource, projectCardSource, postCardSource] = await Promise.all([
    readFile(homePagePath, "utf8"),
    readFile(projectCardPath, "utf8"),
    readFile(postCardPath, "utf8"),
  ]);

  assert.match(
    homeSource,
    /const sectionShellClass = `\$\{surface\(\{[^}]*kind:\s*["']section["'][^}]*\}\)\} p-6`;/,
  );
  assert.match(
    projectCardSource,
    /import \{[\s\S]*(?:mediaFrame|surface)[\s\S]*(?:mediaFrame|surface)[\s\S]*\} from "\.\.\/lib\/ui";/,
  );
  assert.match(
    projectCardSource,
    /surface\(\{[^}]*kind:\s*["']card["'][^}]*interactive:\s*true/,
  );
  assert.match(
    projectCardSource,
    /const mediaFrameClass = mediaFrame\(\)/,
  );
  assert.match(
    postCardSource,
    /import \{[\s\S]*(?:mediaFrame|surface)[\s\S]*(?:mediaFrame|surface)[\s\S]*\} from "\.\.\/lib\/ui";/,
  );
  assert.match(
    postCardSource,
    /surface\(\{[^}]*kind:\s*["']card["'][^}]*interactive:\s*true/,
  );
  assert.match(
    postCardSource,
    /const mediaFrameClass = mediaFrame\(\)/,
  );
  assert.match(postCardSource, /object-cover object-center/);
});

test("shared field and modal surfaces are reused across form and overlay primitives", async () => {
  const [inputSource, selectSource, dialogSource, sheetSource, alertDialogSource] =
    await Promise.all([
      readFile(inputPath, "utf8"),
      readFile(selectPath, "utf8"),
      readFile(dialogPath, "utf8"),
      readFile(sheetPath, "utf8"),
      readFile(alertDialogPath, "utf8"),
    ]);

  assert.match(inputSource, /import \{[\s\S]*field[\s\S]*\} from "@\/lib\/ui";/);
  assert.match(inputSource, /field\(\{[^}]*kind:\s*["']input["']/);
  assert.match(selectSource, /import \{[\s\S]*(?:field|overlay)[\s\S]*(?:field|overlay)[\s\S]*\} from "@\/lib\/ui";/);
  assert.match(selectSource, /field\(\{[^}]*kind:\s*["']input["']/);
  assert.match(selectSource, /overlay\(\{[^}]*kind:\s*["']popover["']/);
  assert.match(dialogSource, /import \{[\s\S]*overlay[\s\S]*\} from "@\/lib\/ui";/);
  assert.match(dialogSource, /overlay\(\{[^}]*kind:\s*["']modal-overlay["']/);
  assert.match(dialogSource, /overlay\(\{[^}]*kind:\s*["']modal-surface["']/);
  assert.match(dialogSource, /overlay\(\{[^}]*kind:\s*["']modal-close["']/);
  assert.match(sheetSource, /import \{[\s\S]*overlay[\s\S]*\} from "@\/lib\/ui";/);
  assert.match(sheetSource, /overlay\(\{[^}]*kind:\s*["']modal-overlay["']/);
  assert.match(sheetSource, /overlay\(\{[^}]*kind:\s*["']modal-surface["']/);
  assert.match(sheetSource, /overlay\(\{[^}]*kind:\s*["']modal-close["']/);
  assert.match(alertDialogSource, /import \{[\s\S]*overlay[\s\S]*\} from "@\/lib\/ui";/);
  assert.match(alertDialogSource, /overlay\(\{[^}]*kind:\s*["']modal-overlay["']/);
  assert.match(alertDialogSource, /overlay\(\{[^}]*kind:\s*["']modal-surface["']/);
});
