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
  assert.match(
    headerSource,
    /id="header-admin-link"[\s\S]*border-red-200\/80[\s\S]*bg-white\/92[\s\S]*text-red-700/,
  );
  assert.match(
    headerSource,
    /id="header-admin-link"[\s\S]*inline-flex[\s\S]*items-center rounded-full[\s\S]*px-2\.5 py-1 text-xs[\s\S]*leading-none[\s\S]*transition-all duration-200[\s\S]*hover:-translate-y-0\.5[\s\S]*hover:border-red-300\/90[\s\S]*hover:bg-red-50[\s\S]*hover:text-red-800/,
  );
  assert.match(
    headerSource,
    /id="header-admin-logout"[\s\S]*border-red-200\/80[\s\S]*bg-white\/92[\s\S]*text-red-700[\s\S]*hover:border-red-300\/90[\s\S]*hover:bg-red-50/,
  );
  assert.match(
    headerSource,
    /id="header-admin-logout"[\s\S]*inline-flex[\s\S]*items-center rounded-full[\s\S]*px-2\.5 py-1 text-xs[\s\S]*leading-none/,
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
  assert.match(footerIconSource, /bg-white\/88/);
  assert.match(footerIconSource, /border-white\/80/);
  assert.match(footerIconSource, /cursor-pointer/);
  assert.match(footerIconSource, /select-none/);
  assert.match(
    footerIconSource,
    /shadow-\[0_10px_30px_rgba\(15,23,42,0\.08\)\]/,
  );
  assert.match(footerIconSource, /hover:-translate-y-0\.5/);
  assert.match(footerIconSource, /hover:border-sky-300/);
  assert.match(footerIconSource, /hover:bg-white/);
  assert.match(footerIconSource, /hover:text-sky-700/);
  assert.match(
    footerAdminModalSource,
    /className="inline-flex h-10 w-10 cursor-pointer select-none items-center justify-center rounded-full border border-white\/80 bg-white\/88 text-muted-foreground shadow-\[0_10px_30px_rgba\(15,23,42,0\.08\)\] transition-all duration-200 hover:-translate-y-0\.5 hover:border-sky-300 hover:bg-white hover:text-sky-700/,
  );
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
    /const sectionShellClass =\s*"rounded-\[2\.25rem\] border border-white\/80 bg-white\/92 p-6 shadow-\[0_24px_60px_rgba\(15,23,42,0\.08\)\]"/,
  );
  assert.match(
    projectCardSource,
    /bg-white\/95 p-3 text-card-foreground shadow-\[0_28px_80px_rgba\(15,23,42,0\.10\)\] transition duration-300 hover:-translate-y-2 hover:bg-white hover:shadow-\[0_38px_90px_rgba\(15,23,42,0\.14\)\]/,
  );
  assert.match(
    projectCardSource,
    /const mediaFrameClass = "relative h-56 overflow-hidden rounded-\[1\.5rem\] bg-slate-100 sm:h-64";/,
  );
  assert.match(
    postCardSource,
    /bg-white\/95 p-3 shadow-\[0_28px_80px_rgba\(15,23,42,0\.10\)\] text-card-foreground transition duration-300 hover:-translate-y-2 hover:bg-white hover:shadow-\[0_38px_90px_rgba\(15,23,42,0\.14\)\]/,
  );
  assert.match(
    postCardSource,
    /const mediaFrameClass = "relative h-56 overflow-hidden rounded-\[1\.5rem\] bg-slate-100 sm:h-64";/,
  );
  assert.match(postCardSource, /object-cover object-center/);
});
