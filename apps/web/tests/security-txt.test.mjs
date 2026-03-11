import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("public security.txt exists with contact metadata", async () => {
  const relativePath = "public/.well-known/security.txt";
  await access(path.join(projectRoot, relativePath));

  const source = await readFile(path.join(projectRoot, relativePath), "utf8");
  assert.match(source, /^Contact: mailto:rickyjun96@gmail\.com$/m);
  assert.match(source, /^Canonical: https:\/\/www\.traceoflight\.dev\/\.well-known\/security\.txt$/m);
  assert.match(source, /^Preferred-Languages: ko, en$/m);
});
