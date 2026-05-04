import {
  DEFAULT_PUBLIC_LOCALE,
  SUPPORTED_PUBLIC_LOCALES,
  type PublicLocale,
} from "../i18n/locales";

export interface LocalizedAlternateLink {
  hrefLang: PublicLocale | "x-default";
  href: URL;
}

export function buildLocalizedAlternates(
  pathnameByLocale: Partial<Record<PublicLocale, string>>,
  canonicalBase: URL,
): LocalizedAlternateLink[] {
  const alternates: LocalizedAlternateLink[] = [];

  for (const locale of SUPPORTED_PUBLIC_LOCALES) {
    const pathname = pathnameByLocale[locale];
    if (!pathname) continue;
    alternates.push({
      hrefLang: locale,
      href: new URL(pathname, canonicalBase),
    });
  }

  const defaultPathname = pathnameByLocale[DEFAULT_PUBLIC_LOCALE];
  if (defaultPathname) {
    alternates.push({
      hrefLang: "x-default",
      href: new URL(defaultPathname, canonicalBase),
    });
  }

  return alternates;
}
