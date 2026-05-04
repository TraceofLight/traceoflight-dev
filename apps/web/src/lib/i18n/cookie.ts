import type { AstroCookies } from "astro";

import {
  DEFAULT_PUBLIC_LOCALE,
  isSupportedPublicLocale,
  normalizePublicLocale,
  SUPPORTED_PUBLIC_LOCALES,
  type PublicLocale,
} from "./locales";

export const LOCALE_COOKIE = "tol_locale";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readLocaleCookie(cookies: AstroCookies): PublicLocale | null {
  const raw = cookies.get(LOCALE_COOKIE)?.value;
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return isSupportedPublicLocale(trimmed) ? trimmed : null;
}

export function writeLocaleCookie(cookies: AstroCookies, locale: PublicLocale): void {
  cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: false,
  });
}

export function pickLocaleFromAcceptLanguage(header: string | null | undefined): PublicLocale {
  if (!header) return DEFAULT_PUBLIC_LOCALE;
  const candidates = header
    .split(",")
    .map((entry) => entry.split(";")[0]?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  for (const candidate of candidates) {
    const primary = candidate.split("-")[0] ?? "";
    if (isSupportedPublicLocale(primary)) {
      return primary;
    }
  }
  return DEFAULT_PUBLIC_LOCALE;
}

export function resolvePreferredLocale(
  cookies: AstroCookies,
  acceptLanguage: string | null | undefined,
): PublicLocale {
  return (
    readLocaleCookie(cookies) ??
    pickLocaleFromAcceptLanguage(acceptLanguage)
  );
}

export function extractLocaleFromPathname(pathname: string): PublicLocale | null {
  const segments = pathname.replace(/^\/+/, "").split("/");
  const first = segments[0]?.toLowerCase() ?? "";
  return isSupportedPublicLocale(first) ? first : null;
}

export { DEFAULT_PUBLIC_LOCALE, SUPPORTED_PUBLIC_LOCALES, normalizePublicLocale };
export type { PublicLocale };
