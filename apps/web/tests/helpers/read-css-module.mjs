import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSS_IMPORT_PATTERN = /@import\s+["']([^"']+)["'];/g;

function toFilePath(input) {
  if (input instanceof URL) {
    return fileURLToPath(input);
  }
  return input;
}

export async function readCssModule(entryPath) {
  const visited = new Set();

  const load = async (filePath) => {
    const absolutePath = path.resolve(filePath);
    if (visited.has(absolutePath)) return "";
    visited.add(absolutePath);

    const source = await readFile(absolutePath, "utf8");
    const importPattern = new RegExp(CSS_IMPORT_PATTERN);
    let expanded = "";
    let cursor = 0;
    let match = importPattern.exec(source);

    while (match) {
      expanded += source.slice(cursor, match.index);
      cursor = match.index + match[0].length;
      const importPath = path.resolve(path.dirname(absolutePath), match[1]);
      expanded += await load(importPath);
      match = importPattern.exec(source);
    }
    expanded += source.slice(cursor);
    return expanded;
  };

  return load(toFilePath(entryPath));
}
