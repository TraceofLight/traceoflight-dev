import { normalizeOptionalImageUrl } from "./cover-media";
import { requestBackend, resolveBackendAssetUrl } from "./backend-api";

export interface DbSeriesSummary {
  id: string;
  slug: string;
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
  limit?: number;
  offset?: number;
}

function toSeriesSummary(row: DbSeriesSummary): SeriesSummary {
  const normalizedCoverImageUrl = normalizeOptionalImageUrl(row.cover_image_url);
  return {
    id: row.id,
    slug: row.slug,
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
  if (typeof options.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listSeries(options: SeriesQueryOptions = {}): Promise<SeriesSummary[]> {
  const response = await requestBackend(`/series${buildSeriesQuery(options)}`);
  if (!response.ok) {
    throw new Error(`failed to fetch series list: ${response.status}`);
  }
  const payload = (await response.json()) as DbSeriesSummary[];
  return payload.map(toSeriesSummary);
}

export async function getSeriesBySlug(
  slug: string,
  options: Omit<SeriesQueryOptions, "limit" | "offset"> = {},
): Promise<SeriesDetail | null> {
  const response = await requestBackend(`/series/${encodeURIComponent(slug)}${buildSeriesQuery(options)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`failed to fetch series detail: ${response.status}`);
  }
  const payload = (await response.json()) as DbSeriesDetail;
  return {
    ...toSeriesSummary(payload),
    posts: Array.isArray(payload.posts) ? payload.posts.map(toSeriesPost) : [],
  };
}

export async function listFeaturedSeries(
  options: Omit<SeriesQueryOptions, "offset"> = {},
): Promise<SeriesSummary[]> {
  const limit = typeof options.limit === "number" ? options.limit : 3;
  const rows = await listSeries({
    includePrivate: options.includePrivate,
    limit: Math.max(limit * 4, limit),
  });

  return rows
    .sort((left, right) => right.updatedAt.valueOf() - left.updatedAt.valueOf())
    .slice(0, limit);
}
