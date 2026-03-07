import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const packageJsonPath = new URL("../package.json", import.meta.url);
const astroConfigPath = new URL("../astro.config.mjs", import.meta.url);
const componentsConfigPath = new URL("../components.json", import.meta.url);
const globalCssPath = new URL("../src/styles/global.css", import.meta.url);
const vitestConfigPath = new URL("../vitest.config.ts", import.meta.url);
const vitestSetupPath = new URL("../vitest.setup.ts", import.meta.url);
const utilsPath = new URL("../src/lib/utils.ts", import.meta.url);
const uiComponentPaths = [
  new URL("../src/components/ui/button.tsx", import.meta.url),
  new URL("../src/components/ui/badge.tsx", import.meta.url),
  new URL("../src/components/ui/card.tsx", import.meta.url),
  new URL("../src/components/ui/dialog.tsx", import.meta.url),
  new URL("../src/components/ui/alert-dialog.tsx", import.meta.url),
  new URL("../src/components/ui/input.tsx", import.meta.url),
  new URL("../src/components/ui/label.tsx", import.meta.url),
  new URL("../src/components/ui/select.tsx", import.meta.url),
  new URL("../src/components/ui/separator.tsx", import.meta.url),
  new URL("../src/components/ui/sheet.tsx", import.meta.url),
];

test("web package is configured for React, Tailwind, shadcn, and UI tests", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const allDependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  assert.equal(typeof packageJson.scripts?.["test:ui"], "string");
  assert.match(packageJson.scripts?.test ?? "", /test:ui/);
  assert.equal(typeof allDependencies["@astrojs/react"], "string");
  assert.equal(typeof allDependencies.react, "string");
  assert.equal(typeof allDependencies["react-dom"], "string");
  assert.equal(typeof allDependencies.tailwindcss, "string");
  assert.equal(typeof allDependencies["@tailwindcss/vite"], "string");
  assert.equal(typeof allDependencies["class-variance-authority"], "string");
  assert.equal(typeof allDependencies.clsx, "string");
  assert.equal(typeof allDependencies["tailwind-merge"], "string");
  assert.equal(typeof allDependencies.vitest, "string");
  assert.equal(typeof allDependencies["@testing-library/react"], "string");
  assert.equal(typeof allDependencies.jsdom, "string");
});

test("Astro config enables React integration and Tailwind's Vite plugin", async () => {
  const source = await readFile(astroConfigPath, "utf8");

  assert.match(source, /from ['"]@astrojs\/react['"]/);
  assert.match(source, /from ['"]@tailwindcss\/vite['"]/);
  assert.match(source, /integrations:\s*\[[\s\S]*react\(\)/);
  assert.match(source, /vite:\s*\{[\s\S]*tailwindcss\(\)/);
});

test("components.json exists for shadcn/ui configuration", async () => {
  await access(componentsConfigPath);
});

test("foundation utility and UI component entry files exist", async () => {
  await access(vitestConfigPath);
  await access(vitestSetupPath);
  await access(utilsPath);

  await Promise.all(uiComponentPaths.map((path) => access(path)));
});

test("global stylesheet is a Tailwind entry point for the public UI theme", async () => {
  const source = await readFile(globalCssPath, "utf8");

  assert.match(source, /@import\s+['"]tailwindcss['"]/);
  assert.match(source, /@import\s+['"]tw-animate-css['"]/);
  assert.doesNotMatch(source, /@plugin\s+['"]tw-animate-css['"]/);
});
