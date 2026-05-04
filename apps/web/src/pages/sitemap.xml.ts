import type { APIRoute } from "astro";

import { listAllPublishedDbPosts } from "../lib/blog-db";
import { SUPPORTED_PUBLIC_LOCALES } from "../lib/i18n/locales";
import { buildLocalizedBlogIndexPath, buildLocalizedBlogPostPath } from "../lib/i18n/pathnames";
import { fetchAllPaged } from "../lib/paginate";
import { resolvePublicSiteOrigin } from "../lib/public-url";
import { listPublishedDbProjects } from "../lib/projects";
import { listSeries } from "../lib/series-db";

interface LocalizedAlternate {
  hrefLang: string;
  path: string;
}

interface SitemapEntry {
  path: string;
  lastmod?: string;
  alternates?: LocalizedAlternate[];
}

function toAbsoluteUrl(path: string, site: URL): string {
  return new URL(path, site).toString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function serializeEntry(entry: SitemapEntry, site: URL): string {
  const lines = [`<url><loc>${escapeXml(toAbsoluteUrl(entry.path, site))}</loc>`];
  if (entry.lastmod) {
    lines.push(`<lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
  }
  if (entry.alternates && entry.alternates.length > 0) {
    for (const alt of entry.alternates) {
      lines.push(
        `<xhtml:link rel="alternate" hreflang="${escapeXml(alt.hrefLang)}" href="${escapeXml(toAbsoluteUrl(alt.path, site))}"/>`,
      );
    }
  }
  lines.push(`</url>`);
  return lines.join("");
}

function buildBlogAlternates(path: (locale: string) => string): LocalizedAlternate[] {
  const alternates: LocalizedAlternate[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
    hrefLang: l,
    path: path(l),
  }));
  alternates.push({ hrefLang: "x-default", path: path("ko") });
  return alternates;
}

async function getDynamicEntries(): Promise<SitemapEntry[]> {
  // Posts already paginate internally; projects/series go through the shared
  // pagination helper because their backend endpoints cap `limit` (le=100/200).
  const [posts, projects, series] = await Promise.all([
    listAllPublishedDbPosts().catch((error: unknown) => {
      console.error("[sitemap] failed to fetch posts:", error);
      return [];
    }),
    fetchAllPaged(
      (limit, offset) => listPublishedDbProjects({ limit, offset }),
      { pageSize: 100, resource: "projects" },
    ),
    fetchAllPaged(
      (limit, offset) => listSeries({ limit, offset }),
      { pageSize: 200, resource: "series" },
    ),
  ]);

  // Post entries: emit one URL per actual stored post at its own locale.
  // We intentionally do not emit alternates yet — until the translation
  // provider creates sibling rows, only the source-locale URL exists, and
  // advertising the other three would point search engines at 404s.
  // Once siblings exist, group `posts` by translation_group_id and emit
  // alternates from the actual sibling locales here.
  const postEntries: SitemapEntry[] = posts.map((post) => ({
    path: buildLocalizedBlogPostPath(post.locale ?? "ko", post.slug),
    lastmod: (post.updatedAt ?? post.publishedAt).toISOString(),
  }));

  // Project detail entries: emit one URL per actual stored project row (no alternates).
  const projectEntries: SitemapEntry[] = projects.map((project) => ({
    path: `/${project.locale ?? "ko"}/projects/${project.slug}/`,
  }));

  // Series detail entries: emit one URL per actual stored series row (no alternates).
  const seriesDetailEntries: SitemapEntry[] = series.map((s) => ({
    path: `/${s.locale ?? "ko"}/series/${s.slug}/`,
    lastmod: s.updatedAt.toISOString(),
  }));

  return [
    ...postEntries,
    ...projectEntries,
    ...seriesDetailEntries,
  ];
}

export const GET: APIRoute = async ({ site }) => {
  const siteOrigin = resolvePublicSiteOrigin(site);

  // Home — always 4 locales, with alternates
  const homeAlternates = buildBlogAlternates((l) => `/${l}/`);
  const homeEntries: SitemapEntry[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
    path: `/${l}/`,
    alternates: homeAlternates,
  }));

  // Project index — always 4 locales, with alternates
  const projectIndexAlternates = buildBlogAlternates((l) => `/${l}/projects/`);
  const projectIndexEntries: SitemapEntry[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
    path: `/${l}/projects/`,
    alternates: projectIndexAlternates,
  }));

  // Series index — always 4 locales, with alternates
  const seriesIndexAlternates = buildBlogAlternates((l) => `/${l}/series/`);
  const seriesIndexEntries: SitemapEntry[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
    path: `/${l}/series/`,
    alternates: seriesIndexAlternates,
  }));

  // Blog index — always 4 locales, with alternates
  const blogIndexAlternates = buildBlogAlternates((l) => buildLocalizedBlogIndexPath(l));
  const blogIndexEntries: SitemapEntry[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
    path: buildLocalizedBlogIndexPath(l),
    alternates: blogIndexAlternates,
  }));

  const entries: SitemapEntry[] = [
    ...homeEntries,
    ...projectIndexEntries,
    ...seriesIndexEntries,
    ...blogIndexEntries,
    ...(await getDynamicEntries()),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">` +
    entries.map((entry) => serializeEntry(entry, siteOrigin)).join("") +
    `</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
};
