import type { APIRoute } from "astro";

import { listAllPublishedDbPosts } from "../lib/blog-db";
import { resolvePublicSiteOrigin } from "../lib/public-url";
import { listPublishedDbProjects } from "../lib/projects";
import { listSeries } from "../lib/series-db";

interface SitemapEntry {
  path: string;
  lastmod?: string;
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
  lines.push(`</url>`);
  return lines.join("");
}

async function getDynamicEntries(): Promise<SitemapEntry[]> {
  const [posts, projects, series] = await Promise.all([
    listAllPublishedDbPosts().catch(() => []),
    listPublishedDbProjects(500).catch(() => []),
    listSeries({ limit: 500 }).catch(() => []),
  ]);

  return [
    ...posts.map((post) => ({
      path: `/blog/${post.slug}`,
      lastmod: (post.updatedAt ?? post.publishedAt).toISOString(),
    })),
    ...projects.map((project) => ({
      path: `/projects/${project.slug}`,
    })),
    ...series.map((seriesItem) => ({
      path: `/series/${seriesItem.slug}`,
      lastmod: seriesItem.updatedAt.toISOString(),
    })),
  ];
}

export const GET: APIRoute = async ({ site }) => {
  const siteOrigin = resolvePublicSiteOrigin(site);
  const entries: SitemapEntry[] = [
    { path: "/" },
    { path: "/blog" },
    { path: "/projects" },
    { path: "/series" },
    ...(await getDynamicEntries()),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
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
