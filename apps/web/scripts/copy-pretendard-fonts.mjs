import { mkdir, copyFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const SOURCE_ROOT = path.resolve(
  APP_ROOT,
  "node_modules/pretendard/dist/web/variable",
);
const TARGET_ROOT = path.resolve(APP_ROOT, "public/fonts/pretendard");

const CSS_FILE = "pretendardvariable-dynamic-subset.css";
const WOFF2_DIR = "woff2-dynamic-subset";

const ATTRIBUTION_BANNER =
  "/*! Pretendard - SIL Open Font License 1.1 - https://github.com/orioncactus/pretendard */";

function minifyCss(source) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*([{}:;,>~+])\s*/g, "$1")
    .replace(/;}/g, "}")
    .replace(/\s+/g, " ")
    .trim();
  return `${ATTRIBUTION_BANNER}\n${stripped}`;
}

async function ensureFreshCopy(sourceFile, targetFile) {
  try {
    const [sourceStat, targetStat] = await Promise.all([
      stat(sourceFile),
      stat(targetFile),
    ]);
    if (
      sourceStat.size === targetStat.size &&
      sourceStat.mtimeMs <= targetStat.mtimeMs
    ) {
      return;
    }
  } catch {
    // target missing — fall through to copy
  }
  await copyFile(sourceFile, targetFile);
}

async function ensureMinifiedCss(sourceFile, targetFile) {
  try {
    const [sourceStat, targetStat] = await Promise.all([
      stat(sourceFile),
      stat(targetFile),
    ]);
    if (sourceStat.mtimeMs <= targetStat.mtimeMs) {
      return;
    }
  } catch {
    // target missing — fall through to write
  }
  const source = await readFile(sourceFile, "utf8");
  const minified = minifyCss(source);
  await writeFile(targetFile, minified, "utf8");
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await copyDirectory(sourcePath, targetPath);
        return;
      }
      await ensureFreshCopy(sourcePath, targetPath);
    }),
  );
}

async function main() {
  await mkdir(TARGET_ROOT, { recursive: true });
  await ensureMinifiedCss(
    path.join(SOURCE_ROOT, CSS_FILE),
    path.join(TARGET_ROOT, CSS_FILE),
  );
  await copyDirectory(
    path.join(SOURCE_ROOT, WOFF2_DIR),
    path.join(TARGET_ROOT, WOFF2_DIR),
  );
  console.log(
    `[pretendard] synced dynamic-subset assets → ${path.relative(APP_ROOT, TARGET_ROOT)}`,
  );
}

main().catch((error) => {
  console.error("[pretendard] copy failed:", error);
  process.exitCode = 1;
});
