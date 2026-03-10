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
  "../src/components/public/FooterAdminModal.tsx",
  import.meta.url,
);
const mobileNavSheetPath = new URL(
  "../src/components/public/MobileNavSheet.tsx",
  import.meta.url,
);
const homePagePath = new URL("../src/pages/index.astro", import.meta.url);
const projectCardPath = new URL(
  "../src/components/ProjectCard.astro",
  import.meta.url,
);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);

test("header navigation keeps active and hover states without a heavy shared rail", async () => {
  const [headerSource, headerLinkSource] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(headerLinkPath, "utf8"),
  ]);

  assert.match(headerSource, /class="text-base font-semibold tracking-tight text-foreground"/);
  assert.doesNotMatch(headerSource, /bg-white\/88 px-4 py-2/);
  assert.match(headerSource, /class="hidden items-center gap-1 md:flex"/);
  assert.match(headerSource, /import \{ DANGER_PILL_ACTION_CLASS \} from "\.\.\/lib\/ui-effects";/);
  assert.match(
    headerSource,
    /id="header-admin-link"[\s\S]*class=\{DANGER_PILL_ACTION_CLASS\}/,
  );
  assert.match(
    headerSource,
    /id="header-admin-logout"[\s\S]*class=\{DANGER_PILL_ACTION_CLASS\}/,
  );
  assert.doesNotMatch(headerSource, /rounded-full border border-white\/70 bg-white\/72 p-1\.5/);
  assert.match(headerLinkSource, /select-none/);
  assert.match(headerLinkSource, /hover:bg-white\/84/);
  assert.match(
    headerLinkSource,
    /hover:shadow-\[0_8px_24px_rgba\(15,23,42,0\.08\)\]/,
  );
  assert.match(
    headerLinkSource,
    /"border border-white\/80 bg-white\/92 text-foreground shadow-\[0_10px_30px_rgba\(15,23,42,0\.08\)\]": isActive/,
  );
});

test("footer icons use the same filled pill treatment as the admin entry button", async () => {
  const [footerSource, footerIconSource, footerAdminModalSource] = await Promise.all([
    readFile(footerPath, "utf8"),
    readFile(footerIconLinkPath, "utf8"),
    readFile(footerAdminModalPath, "utf8"),
  ]);

  assert.match(
    footerSource,
    /class="site-footer-dock flex items-center gap-3 rounded-full border border-white\/70 bg-white\/72 px-3 py-2 shadow-\[0_20px_50px_rgba\(15,23,42,0\.08\)\]"/,
  );
  assert.match(footerIconSource, /import \{ PUBLIC_ICON_ACTION_CLASS \} from "\.\.\/lib\/ui-effects";/);
  assert.match(footerIconSource, /class=\{PUBLIC_ICON_ACTION_CLASS\}/);
  assert.match(
    footerAdminModalSource,
    /import \{ PUBLIC_ICON_ACTION_CLASS \} from "@\/lib\/ui-effects";/,
  );
  assert.match(footerAdminModalSource, /className=\{`\$\{PUBLIC_ICON_ACTION_CLASS\} focus-visible:outline-none/);
  assert.match(footerAdminModalSource, /type="button"/);
  assert.match(footerSource, /class="site-footer-surface border-t border-white\/60 bg-white\/72 backdrop-blur-xl"/);
});

test("mobile navigation sheet stays compact and drops redundant title copy", async () => {
  const source = await readFile(mobileNavSheetPath, "utf8");

  assert.match(source, /<SheetContent side="right" className="w-\[min\(22rem,calc\(100vw-1\.5rem\)\)\] p-5">/);
  assert.doesNotMatch(source, /<SheetHeader>/);
  assert.doesNotMatch(source, /<SheetTitle>/);
  assert.doesNotMatch(source, /<SheetDescription>/);
  assert.doesNotMatch(source, /Navigate/);
  assert.doesNotMatch(source, /Move across the public site\./);
  assert.match(source, /className="mt-2 flex flex-col gap-1\.5"/);
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
    /const sectionShellClass = `\$\{PUBLIC_SECTION_SURFACE_CLASS\} p-6`;/,
  );
  assert.match(
    projectCardSource,
    /import \{[\s\S]*PUBLIC_HOVER_CARD_CLASS[\s\S]*PUBLIC_MEDIA_FRAME_CLASS[\s\S]*\} from "\.\.\/lib\/ui-effects";/,
  );
  assert.match(projectCardSource, /const anchorClass = `flex h-full flex-col p-3 \$\{PUBLIC_HOVER_CARD_CLASS\}`;/);
  assert.match(
    projectCardSource,
    /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/,
  );
  assert.match(
    postCardSource,
    /import \{[\s\S]*PUBLIC_HOVER_CARD_CLASS[\s\S]*PUBLIC_MEDIA_FRAME_CLASS[\s\S]*\} from "\.\.\/lib\/ui-effects";/,
  );
  assert.match(postCardSource, /const anchorClass = `flex h-full flex-col p-3 \$\{PUBLIC_HOVER_CARD_CLASS\}`;/);
  assert.match(
    postCardSource,
    /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/,
  );
  assert.match(postCardSource, /object-cover object-center/);
});
