import { slugify } from "./slug";
import type { AdminPostPayload, AdminSeriesContext, AdminTagOption } from "./types";
import type { SubmitPayload, SubmitRequestInfo } from "./submit";

export type PostLoadFailureKind = "not_found" | "http_error" | "network_error";

export type PostLoadResult =
  | {
      ok: true;
      payload: Partial<AdminPostPayload>;
    }
  | {
      ok: false;
      reason: PostLoadFailureKind;
    };

export type DraftListResult =
  | {
      ok: true;
      posts: unknown;
    }
  | {
      ok: false;
      reason: "http_error" | "network_error";
    };

export type TagListResult =
  | {
      ok: true;
      tags: AdminTagOption[];
    }
  | {
      ok: false;
      reason: "http_error" | "network_error";
    };

export type DraftDeleteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "http_error" | "network_error";
    };

export interface SeriesListItem {
  slug: string;
  title: string;
}

interface SeriesDetail {
  slug: string;
  posts: string[];
}

interface SeriesUpsertPayload {
  slug: string;
  title: string;
  description: string;
  cover_image_url: string | null;
}

type SeriesListResult =
  | { ok: true; series: SeriesListItem[] }
  | { ok: false; reason: "http_error" | "network_error" };

type SeriesDetailResult =
  | { ok: true; series: SeriesDetail | null }
  | { ok: false; reason: "http_error" | "network_error" };

type SeriesWriteResult =
  | { ok: true; status: number }
  | { ok: false; status: number; reason: "http_error" | "network_error"; errorPayload: unknown };

export type SeriesSyncResult =
  | { ok: true; seriesSlug: string | null }
  | { ok: false; reason: string };

export interface SubmitCreatedPost {
  slug: string;
  status: string;
}

export type SubmitPostResult =
  | { ok: true; created: SubmitCreatedPost }
  | { ok: false; status: number; errorPayload: unknown };

export async function requestPostBySlug(slug: string): Promise<PostLoadResult> {
  try {
    const response = await fetch(`/internal-api/posts/${encodeURIComponent(slug)}`);
    if (response.status === 404) {
      return { ok: false, reason: "not_found" };
    }
    if (!response.ok) {
      return { ok: false, reason: "http_error" };
    }
    const rawPayload = (await response.json()) as unknown;
    const payload = normalizeDraftPayload(rawPayload);
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function requestDraftBySlug(slug: string): Promise<PostLoadResult> {
  try {
    const response = await fetch(
      `/internal-api/posts/${encodeURIComponent(slug)}?status=draft`,
    );
    if (response.status === 404) {
      return { ok: false, reason: "not_found" };
    }
    if (!response.ok) {
      return { ok: false, reason: "http_error" };
    }
    const rawPayload = (await response.json()) as unknown;
    const payload = normalizeDraftPayload(rawPayload);
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function requestDraftList(): Promise<DraftListResult> {
  try {
    const response = await fetch("/internal-api/posts?status=draft&limit=100&offset=0");
    if (!response.ok) {
      return { ok: false, reason: "http_error" };
    }
    const posts = (await response.json()) as unknown;
    return { ok: true, posts };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function requestDraftDelete(slug: string): Promise<DraftDeleteResult> {
  try {
    const response = await fetch(
      `/internal-api/posts/${encodeURIComponent(slug)}?status=draft`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      return { ok: false, reason: "http_error" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function requestTagList(query = ""): Promise<TagListResult> {
  const params = new URLSearchParams({
    limit: "40",
    offset: "0",
  });
  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    params.set("query", trimmedQuery);
  }

  try {
    const response = await fetch(`/internal-api/tags?${params.toString()}`);
    if (!response.ok) {
      return { ok: false, reason: "http_error" };
    }
    const raw = (await response.json()) as unknown;
    return { ok: true, tags: normalizeTagOptions(raw) };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function requestSeriesList(): Promise<SeriesListResult> {
  const params = new URLSearchParams({
    include_private: "true",
    limit: "200",
    offset: "0",
  });

  try {
    const response = await fetch(`/internal-api/series?${params.toString()}`);
    if (!response.ok) {
      return { ok: false, reason: "http_error" };
    }
    const raw = (await response.json()) as unknown;
    return { ok: true, series: normalizeSeriesList(raw) };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function requestPostSubmit(
  request: SubmitRequestInfo,
  payload: SubmitPayload,
): Promise<SubmitPostResult> {
  const response = await fetch(request.path, {
    method: request.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as unknown;
    return {
      ok: false,
      status: response.status,
      errorPayload,
    };
  }

  const created = (await response.json()) as SubmitCreatedPost;
  return { ok: true, created };
}

export async function syncPostSeriesAssignment(input: {
  postSlug: string;
  seriesName: string;
  previousSeriesSlug: string | null;
}): Promise<SeriesSyncResult> {
  const postSlug = input.postSlug.trim().toLowerCase();
  if (!postSlug) {
    return { ok: false, reason: "게시글 slug가 비어 있습니다." };
  }

  const seriesName = input.seriesName.trim();
  const previousSeriesSlug = input.previousSeriesSlug?.trim().toLowerCase() || null;

  let targetSeriesSlug: string | null = null;
  if (seriesName) {
    const ensureResult = await ensureSeriesByName(seriesName);
    if (!ensureResult.ok) {
      return ensureResult;
    }
    targetSeriesSlug = ensureResult.seriesSlug;
  }

  if (previousSeriesSlug && previousSeriesSlug !== targetSeriesSlug) {
    const removeResult = await removePostFromSeries(previousSeriesSlug, postSlug);
    if (!removeResult.ok) {
      return removeResult;
    }
  }

  if (targetSeriesSlug) {
    const appendResult = await appendPostToSeries(targetSeriesSlug, postSlug);
    if (!appendResult.ok) {
      return appendResult;
    }
  }

  return { ok: true, seriesSlug: targetSeriesSlug };
}

function normalizeDraftPayload(raw: unknown): Partial<AdminPostPayload> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    slug: typeof payload.slug === "string" ? payload.slug : undefined,
    title: typeof payload.title === "string" ? payload.title : undefined,
    excerpt:
      typeof payload.excerpt === "string" || payload.excerpt === null
        ? payload.excerpt
        : undefined,
    body_markdown:
      typeof payload.body_markdown === "string"
        ? payload.body_markdown
        : undefined,
    cover_image_url:
      typeof payload.cover_image_url === "string" || payload.cover_image_url === null
        ? payload.cover_image_url
        : undefined,
    status: payload.status === "published" ? "published" : "draft",
    visibility: payload.visibility === "private" ? "private" : "public",
    tags: normalizeTagSlugs(payload.tags),
    series_context: normalizeSeriesContext(payload.series_context),
  };
}

function normalizeTagOptions(raw: unknown): AdminTagOption[] {
  if (!Array.isArray(raw)) return [];
  const tags: AdminTagOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const slug = typeof (item as { slug?: unknown }).slug === "string"
      ? (item as { slug: string }).slug.trim()
      : "";
    if (!slug || seen.has(slug)) continue;
    const label = typeof (item as { label?: unknown }).label === "string"
      ? (item as { label: string }).label.trim() || slug
      : slug;
    seen.add(slug);
    tags.push({ slug, label });
  }
  return tags;
}

function normalizeTagSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let slug = "";
    if (typeof item === "string") {
      slug = item.trim();
    } else if (item && typeof item === "object" && typeof (item as { slug?: unknown }).slug === "string") {
      slug = (item as { slug: string }).slug.trim();
    }
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    tags.push(slug);
  }
  return tags;
}

function normalizeSeriesContext(raw: unknown): AdminSeriesContext | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.series_slug !== "string" ||
    typeof value.series_title !== "string"
  ) {
    return null;
  }
  const series_slug = value.series_slug.trim().toLowerCase();
  const series_title = value.series_title.trim();
  if (!series_slug || !series_title) return null;
  return { series_slug, series_title };
}

function normalizeSeriesList(raw: unknown): SeriesListItem[] {
  if (!Array.isArray(raw)) return [];
  const items: SeriesListItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    const slug = typeof value.slug === "string" ? value.slug.trim().toLowerCase() : "";
    const title = typeof value.title === "string" ? value.title.trim() : "";
    if (!slug || !title || seen.has(slug)) continue;
    seen.add(slug);
    items.push({ slug, title });
  }
  return items;
}

function normalizeSeriesDetail(raw: unknown): SeriesDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const slug = typeof value.slug === "string" ? value.slug.trim().toLowerCase() : "";
  if (!slug) return null;
  const postsRaw = Array.isArray(value.posts) ? value.posts : [];
  const posts: string[] = [];
  const seen = new Set<string>();
  for (const post of postsRaw) {
    if (!post || typeof post !== "object") continue;
    const postSlug = typeof (post as { slug?: unknown }).slug === "string"
      ? (post as { slug: string }).slug.trim().toLowerCase()
      : "";
    if (!postSlug || seen.has(postSlug)) continue;
    seen.add(postSlug);
    posts.push(postSlug);
  }
  return { slug, posts };
}

async function requestSeriesDetail(slug: string): Promise<SeriesDetailResult> {
  try {
    const response = await fetch(`/internal-api/series/${encodeURIComponent(slug)}?include_private=true`);
    if (response.status === 404) {
      return { ok: true, series: null };
    }
    if (!response.ok) {
      return { ok: false, reason: "http_error" };
    }
    const raw = (await response.json()) as unknown;
    return { ok: true, series: normalizeSeriesDetail(raw) };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

async function requestSeriesCreate(payload: SeriesUpsertPayload): Promise<SeriesWriteResult> {
  try {
    const response = await fetch("/internal-api/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: "http_error",
        errorPayload: await response.json().catch(() => null),
      };
    }
    return { ok: true, status: response.status };
  } catch {
    return { ok: false, status: 0, reason: "network_error", errorPayload: null };
  }
}

async function requestSeriesReplacePosts(slug: string, postSlugs: string[]): Promise<SeriesWriteResult> {
  try {
    const response = await fetch(`/internal-api/series/${encodeURIComponent(slug)}/posts`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ post_slugs: postSlugs }),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: "http_error",
        errorPayload: await response.json().catch(() => null),
      };
    }
    return { ok: true, status: response.status };
  } catch {
    return { ok: false, status: 0, reason: "network_error", errorPayload: null };
  }
}

async function ensureSeriesByName(seriesName: string): Promise<SeriesSyncResult> {
  const listResult = await requestSeriesList();
  if (!listResult.ok) {
    return { ok: false, reason: "시리즈 목록을 불러오지 못했습니다." };
  }

  const normalizedName = seriesName.trim().toLowerCase();
  const normalizedSlug = slugify(seriesName) || "series";
  const matched = listResult.series.find(
    (item) => item.title.trim().toLowerCase() === normalizedName || item.slug === normalizedSlug,
  );
  if (matched) {
    return { ok: true, seriesSlug: matched.slug };
  }

  for (let index = 0; index < 20; index += 1) {
    const candidateSlug = index === 0 ? normalizedSlug : `${normalizedSlug}-${index + 1}`;
    const createResult = await requestSeriesCreate({
      slug: candidateSlug,
      title: seriesName.trim(),
      description: `${seriesName.trim()} series`,
      cover_image_url: null,
    });
    if (createResult.ok) {
      return { ok: true, seriesSlug: candidateSlug };
    }
    if (createResult.reason === "network_error") {
      return { ok: false, reason: "시리즈 생성 중 네트워크 오류가 발생했습니다." };
    }
    if (createResult.status !== 409) {
      return { ok: false, reason: "시리즈 생성에 실패했습니다." };
    }
  }

  return { ok: false, reason: "시리즈 slug 충돌로 생성하지 못했습니다." };
}

async function removePostFromSeries(seriesSlug: string, postSlug: string): Promise<SeriesSyncResult> {
  const detailResult = await requestSeriesDetail(seriesSlug);
  if (!detailResult.ok) {
    return { ok: false, reason: "기존 시리즈 정보를 확인하지 못했습니다." };
  }
  const existing = detailResult.series;
  if (!existing) {
    return { ok: true, seriesSlug: null };
  }

  const nextPostSlugs = existing.posts.filter((slug) => slug !== postSlug);
  if (nextPostSlugs.length === existing.posts.length) {
    return { ok: true, seriesSlug: null };
  }

  const replaceResult = await requestSeriesReplacePosts(seriesSlug, nextPostSlugs);
  if (replaceResult.ok || replaceResult.status === 404) {
    return { ok: true, seriesSlug: null };
  }
  return { ok: false, reason: "기존 시리즈에서 글을 제거하지 못했습니다." };
}

async function appendPostToSeries(seriesSlug: string, postSlug: string): Promise<SeriesSyncResult> {
  const detailResult = await requestSeriesDetail(seriesSlug);
  if (!detailResult.ok || !detailResult.series) {
    return { ok: false, reason: "대상 시리즈 정보를 확인하지 못했습니다." };
  }

  const nextPostSlugs = detailResult.series.posts.filter((slug) => slug !== postSlug);
  nextPostSlugs.push(postSlug);
  const replaceResult = await requestSeriesReplacePosts(seriesSlug, nextPostSlugs);
  if (!replaceResult.ok) {
    return { ok: false, reason: "시리즈에 게시글을 연결하지 못했습니다." };
  }
  return { ok: true, seriesSlug };
}
