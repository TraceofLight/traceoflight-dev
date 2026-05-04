import { normalizePublicLocale, type PublicLocale } from "./locales";

export function buildLocalizedBlogIndexPath(locale: string): string {
  return `/${normalizePublicLocale(locale)}/blog/`;
}

export function buildLocalizedBlogPostPath(locale: string, slug: string): string {
  const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  return `${buildLocalizedBlogIndexPath(locale)}${normalizedSlug}/`;
}

export function buildLocalizedSeriesPath(locale: string, slug: string): string {
  const normalizedLocale = normalizePublicLocale(locale);
  const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  return `/${normalizedLocale}/series/${normalizedSlug}`;
}

export type { PublicLocale };
