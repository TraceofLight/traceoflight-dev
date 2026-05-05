/**
 * Builders for the JSON-LD structured data emitted on blog post, series,
 * and project pages. The shapes returned here intentionally match what
 * the legacy inline construction inside the Astro layouts was producing,
 * so swapping these helpers in does not change the rendered output.
 */

import { SITE_AUTHOR, SITE_URL } from "../../consts";
import { localeToBcp47, type PublicLocale } from "../i18n/locales";

type StructuredData = Record<string, unknown>;

interface BreadcrumbItem {
  name: string;
  path: string;
}

function toAbsoluteUrl(input: string): string {
  return new URL(input, SITE_URL).toString();
}

function buildBreadcrumb(items: BreadcrumbItem[]): StructuredData {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: toAbsoluteUrl(entry.path),
    })),
  };
}

export interface BlogPostingSchemaInput {
  title: string;
  description: string;
  postSlug: string;
  pubDate: Date;
  updatedDate?: Date;
  locale: PublicLocale;
  /** Direct URL to the cover image (preferred when present). */
  imageUrl?: string;
  /**
   * Astro-optimized image metadata. When `imageUrl` is unset the
   * structured data falls back to `imageMetadata.src` (treated as
   * relative to the site origin).
   */
  imageMetadata?: { src: string } | null | undefined;
}

export function buildBlogPostingSchema(
  input: BlogPostingSchemaInput,
): StructuredData {
  const canonicalUrl = toAbsoluteUrl(`/${input.locale}/blog/${input.postSlug}`);
  const schema: StructuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    inLanguage: localeToBcp47(input.locale),
    datePublished: input.pubDate.toISOString(),
    ...(input.updatedDate
      ? { dateModified: input.updatedDate.toISOString() }
      : {}),
    author: [
      {
        "@type": "Person",
        name: SITE_AUTHOR,
        url: SITE_URL,
      },
    ],
    publisher: {
      "@type": "Person",
      name: SITE_AUTHOR,
      url: SITE_URL,
    },
  };

  const imageSource = input.imageUrl ?? input.imageMetadata?.src;
  if (imageSource) {
    schema.image = [toAbsoluteUrl(imageSource)];
  }

  schema.breadcrumb = buildBreadcrumb([
    { name: "Home", path: `/${input.locale}/` },
    { name: "Blog", path: `/${input.locale}/blog/` },
    { name: input.title, path: `/${input.locale}/blog/${input.postSlug}` },
  ]);

  return schema;
}

export interface SeriesCollectionSchemaInput {
  slug: string;
  title: string;
  description: string;
  updatedAt: Date;
  locale: PublicLocale;
  coverImageUrl?: string;
  posts: { slug: string; title: string }[];
}

export function buildSeriesCollectionSchema(
  input: SeriesCollectionSchemaInput,
): StructuredData {
  const canonicalUrl = toAbsoluteUrl(`/${input.locale}/series/${input.slug}`);
  const schema: StructuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.title,
    headline: input.title,
    description: input.description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    inLanguage: localeToBcp47(input.locale),
    dateModified: input.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: SITE_AUTHOR,
      url: SITE_URL,
    },
  };

  if (input.coverImageUrl) {
    schema.image = [toAbsoluteUrl(input.coverImageUrl)];
  }

  schema.hasPart = input.posts.map((post) => ({
    "@type": "Article",
    headline: post.title,
    url: toAbsoluteUrl(`/${input.locale}/blog/${post.slug}`),
  }));

  schema.breadcrumb = buildBreadcrumb([
    { name: "Home", path: `/${input.locale}/` },
    { name: "Series", path: `/${input.locale}/series/` },
    { name: input.title, path: `/${input.locale}/series/${input.slug}` },
  ]);

  return schema;
}

export interface ProjectCreativeWorkSchemaInput {
  slug: string;
  title: string;
  summary: string;
  stack: string[];
  locale: PublicLocale;
  coverImageUrl?: string;
}

export function buildProjectCreativeWorkSchema(
  input: ProjectCreativeWorkSchemaInput,
): StructuredData {
  const canonicalUrl = toAbsoluteUrl(`/${input.locale}/projects/${input.slug}`);
  const schema: StructuredData = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: input.title,
    headline: input.title,
    description: input.summary,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    inLanguage: localeToBcp47(input.locale),
    ...(input.stack.length > 0 ? { keywords: input.stack.join(", ") } : {}),
    author: {
      "@type": "Person",
      name: SITE_AUTHOR,
      url: SITE_URL,
    },
  };

  if (input.coverImageUrl) {
    schema.image = [toAbsoluteUrl(input.coverImageUrl)];
  }

  schema.breadcrumb = buildBreadcrumb([
    { name: "Home", path: `/${input.locale}/` },
    { name: "Projects", path: `/${input.locale}/projects/` },
    { name: input.title, path: `/${input.locale}/projects/${input.slug}` },
  ]);

  return schema;
}
