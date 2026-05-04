import { test } from "node:test";
import assert from "node:assert/strict";

test("dictionary modules export same key shape", async () => {
  const { ko } = await import("../src/lib/i18n/dict/ko.ts");
  const { en } = await import("../src/lib/i18n/dict/en.ts");
  const { ja } = await import("../src/lib/i18n/dict/ja.ts");
  const { zh } = await import("../src/lib/i18n/dict/zh.ts");

  function flatten(obj, prefix = "") {
    return Object.entries(obj).flatMap(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      return typeof v === "object" && v !== null ? flatten(v, key) : [key];
    });
  }

  const koKeys = flatten(ko).sort();
  for (const [name, dict] of [["en", en], ["ja", ja], ["zh", zh]]) {
    const keys = flatten(dict).sort();
    assert.deepEqual(keys, koKeys, `${name} dictionary key shape diverged from ko`);
  }
});
