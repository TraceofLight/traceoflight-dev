import assert from "node:assert/strict";
import { test } from "node:test";

import { localeToBcp47, SUPPORTED_PUBLIC_LOCALES } from "../src/lib/i18n/locales.ts";

test("localeToBcp47 maps every supported locale to a BCP-47 region tag", () => {
  const expected = {
    ko: "ko-KR",
    en: "en-US",
    ja: "ja-JP",
    zh: "zh-CN",
  };
  for (const locale of SUPPORTED_PUBLIC_LOCALES) {
    assert.equal(localeToBcp47(locale), expected[locale]);
  }
});

test("localeToBcp47 covers every supported locale (no gaps)", () => {
  for (const locale of SUPPORTED_PUBLIC_LOCALES) {
    assert.match(localeToBcp47(locale), /^[a-z]{2}-[A-Z]{2}$/);
  }
});
