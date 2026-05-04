import { ko } from "./dict/ko";
import { en } from "./dict/en";
import { ja } from "./dict/ja";
import { zh } from "./dict/zh";
import type { PublicLocale } from "./locales";
import type { Dictionary } from "./dict/ko";

export type { Dictionary } from "./dict/ko";

const dictionaries = { ko, en, ja, zh } satisfies Record<string, Dictionary>;

export function pickDictionary(locale: PublicLocale): Dictionary {
  return dictionaries[locale];
}
