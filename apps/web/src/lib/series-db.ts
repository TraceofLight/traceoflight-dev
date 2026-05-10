import { normalizeOptionalImageUrl } from "./cover-media";
import { requestBackend, resolveBackendAssetUrl } from "./backend-api";
import { serverLogger } from "./server/logging";

export interface DbSeriesSummary {
  id: string;
  slug: string;
  locale?: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export interface DbSeriesPost {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  order_index: number;
  published_at: string | null;
  visibility: "public" | "private";
}

export interface DbSeriesDetail extends DbSeriesSummary {
  posts: DbSeriesPost[];
}

export interface SeriesSummary {
  id: string;
  slug: string;
  locale?: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  postCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeriesPost {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl?: string;
  orderIndex: number;
  publishedAt?: Date;
  visibility: "public" | "private";
}

export interface SeriesDetail extends SeriesSummary {
  posts: SeriesPost[];
}

interface SeriesQueryOptions {
  includePrivate?: boolean;
  locale?: string;
  limit?: number;
  offset?: number;
}

function toSeriesSummary(row: DbSeriesSummary): SeriesSummary {
  const normalizedCoverImageUrl = normalizeOptionalImageUrl(row.cover_image_url);
  return {
    id: row.id,
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    description: row.description,
    coverImageUrl: resolveBackendAssetUrl(normalizedCoverImageUrl),
    postCount: row.post_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toSeriesPost(row: DbSeriesPost): SeriesPost {
  const normalizedCoverImageUrl = normalizeOptionalImageUrl(row.cover_image_url);
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt?.trim() ?? "",
    coverImageUrl: resolveBackendAssetUrl(normalizedCoverImageUrl),
    orderIndex: row.order_index,
    publishedAt: row.published_at ? new Date(row.published_at) : undefined,
    visibility: row.visibility === "private" ? "private" : "public",
  };
}

function buildSeriesQuery(options: SeriesQueryOptions = {}): string {
  const params = new URLSearchParams();
  if (typeof options.includePrivate === "boolean") {
    params.set("include_private", options.includePrivate ? "true" : "false");
  }
  if (options.locale) {
    params.set("locale", options.locale);
  }
  if (typeof options.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listSeries(
  options: SeriesQueryOptions = {},
): Promise<SeriesSummary[]> {
  serverLogger.debug("series.list_requested", {
    include_private: Boolean(options.includePrivate),
    locale: options.locale ?? "",
    limit: options.limit ?? null,
    offset: options.offset ?? null,
  });
  const response = await requestBackend(`/series${buildSeriesQuery(options)}`);
  if (!response.ok) {
    throw new Error(`failed to fetch series list: ${response.status}`);
  }
  const payload = (await response.json()) as DbSeriesSummary[];
  serverLogger.debug("series.list_returned", {
    count: payload.length,
    include_private: Boolean(options.includePrivate),
  });
  return payload.map(toSeriesSummary);
}

export async function getSeriesBySlug(
  slug: string,
  options: Omit<SeriesQueryOptions, "limit" | "offset"> = {},
): Promise<SeriesDetail | null> {
  serverLogger.debug("series.detail_requested", {
    slug,
    include_private: Boolean(options.includePrivate),
    locale: options.locale ?? "",
  });
  const response = await requestBackend(
    `/series/${encodeURIComponent(slug)}${buildSeriesQuery(options)}`,
  );
  if (response.status === 404) {
    serverLogger.debug("series.detail_returned", {
      slug,
      found: false,
      status: response.status,
    });
    return null;
  }
  if (!response.ok) {
    throw new Error(`failed to fetch series detail: ${response.status}`);
  }
  const payload = (await response.json()) as DbSeriesDetail;
  serverLogger.debug("series.detail_returned", {
    slug: payload.slug,
    found: true,
    status: response.status,
    post_count: Array.isArray(payload.posts) ? payload.posts.length : 0,
  });
  return {
    ...toSeriesSummary(payload),
    posts: Array.isArray(payload.posts) ? payload.posts.map(toSeriesPost) : [],
  };
}

export async function listFeaturedSeries(
  options: Omit<SeriesQueryOptions, "offset"> = {},
): Promise<SeriesSummary[]> {
  const limit = typeof options.limit === "number" ? options.limit : 3;
  return listSeries({
    includePrivate: options.includePrivate,
    locale: options.locale,
    limit: limit,
  });
}

export async function resolveSeriesSlugRedirect(
  slug: string,
  locale: string,
): Promise<string | null> {
  serverLogger.debug("series.redirect_requested", { slug, locale });
  const params = new URLSearchParams({ locale });
  const response = await requestBackend(
    `/series/redirects/${encodeURIComponent(slug)}?${params.toString()}`,
  );
  if (response.status === 404) {
    serverLogger.debug("series.redirect_resolved", {
      slug,
      locale,
      found: false,
    });
    return null;
  }
  if (!response.ok) {
    throw new Error(`failed to resolve series redirect: ${response.status}`);
  }
  const body = (await response.json()) as { target_slug?: string };
  const targetSlug = body.target_slug ?? null;
  serverLogger.debug("series.redirect_resolved", {
    slug,
    locale,
    found: targetSlug !== null,
    target_slug: targetSlug ?? "",
  });
  return targetSlug;
}
