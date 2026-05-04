import type { PublicLocale } from "./locales";

const _LOCALE_TAG: Record<PublicLocale, string> = {
  ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN",
};

export function formatDate(value: Date | string | number, locale: PublicLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(_LOCALE_TAG[locale], {
    year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

export function formatDateTime(value: Date | string | number, locale: PublicLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(_LOCALE_TAG[locale], {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}
