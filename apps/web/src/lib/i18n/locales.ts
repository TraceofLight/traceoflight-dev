export const SUPPORTED_PUBLIC_LOCALES = ["ko", "en", "ja", "zh"] as const;

export const DEFAULT_PUBLIC_LOCALE = "ko";

export type PublicLocale = (typeof SUPPORTED_PUBLIC_LOCALES)[number];

export function isSupportedPublicLocale(value: string): value is PublicLocale {
  return (SUPPORTED_PUBLIC_LOCALES as readonly string[]).includes(value);
}

export function normalizePublicLocale(value: string | null | undefined): PublicLocale {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isSupportedPublicLocale(normalized) ? normalized : DEFAULT_PUBLIC_LOCALE;
}
