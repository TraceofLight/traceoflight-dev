import type {
  AdminPostPayload,
  AdminProjectProfile,
  AdminSeriesContext,
  AdminTagOption,
} from "./types";
import type { SubmitPayload, SubmitRequestInfo } from "./submit";

export type PostLoadFailureKind =
  | "not_found"
  | "unauthorized"
  | "http_error"
  | "network_error";

export type PostLoadResult =
  | {
      ok: true;
      payload: Partial<AdminPostPayload>;
    }
  | {
      ok: false;
      reason: PostLoadFailureKind;
    };

type SimpleFailure = "http_error" | "network_error";

export type DraftListResult =
  | {
      ok: true;
      posts: unknown;
    }
  | {
      ok: false;
      reason: SimpleFailure;
    };

export type TagListResult =
  | {
      ok: true;
      tags: AdminTagOption[];
    }
  | {
      ok: false;
      reason: SimpleFailure;
    };

export type DraftDeleteResult =
  | { ok: true }
  | {
      ok: false;
      reason: SimpleFailure;
    };

export interface SeriesListItem {
  slug: string;
  title: string;
}

type SeriesListResult =
  | { ok: true; series: SeriesListItem[] }
  | { ok: false; reason: SimpleFailure };

export interface SubmitCreatedPost {
  slug: string;
  status: string;
}

export type SubmitPostResult =
  | { ok: true; created: SubmitCreatedPost }
  | { ok: false; status: number; errorPayload: unknown };

export type AdminLoginResult =
  | { ok: true }
  | { ok: false; status: number; errorPayload: unknown };

type AuthFetchResult =
  | { ok: true; raw: unknown }
  | { ok: false; reason: PostLoadFailureKind };

type SimpleFetchResult =
  | { ok: true; raw: unknown }
  | { ok: false; reason: SimpleFailure };

async function fetchAuthJson(
  url: string,
  init?: RequestInit,
): Promise<AuthFetchResult> {
  try {
    const response = await fetch(url, init);
    if (response.status === 404) return { ok: false, reason: "not_found" };
    if (response.status === 401) return { ok: false, reason: "unauthorized" };
    if (!response.ok) return { ok: false, reason: "http_error" };
    const raw = (await response.json()) as unknown;
    return { ok: true, raw };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

async function fetchSimpleJson(
  url: string,
  init?: RequestInit,
): Promise<SimpleFetchResult> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return { ok: false, reason: "http_error" };
    if (response.status === 204) return { ok: true, raw: null };
    const raw = (await response.json()) as unknown;
    return { ok: true, raw };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function requestPostBySlug(
  slug: string,
  options: { status?: "draft" | "published" } = {},
): Promise<PostLoadResult> {
  const url =
    options.status === "draft"
      ? `/internal-api/posts/${encodeURIComponent(slug)}?status=draft`
      : `/internal-api/posts/${encodeURIComponent(slug)}`;
  const result = await fetchAuthJson(url);
  if (!result.ok) return result;
  return { ok: true, payload: normalizeAdminPostPayload(result.raw) };
}

export async function requestDraftList(): Promise<DraftListResult> {
  const result = await fetchSimpleJson(
    "/internal-api/posts?status=draft&limit=100&offset=0",
  );
  if (!result.ok) return result;
  return { ok: true, posts: result.raw };
}

export async function requestDraftDelete(slug: string): Promise<DraftDeleteResult> {
  const result = await fetchSimpleJson(
    `/internal-api/posts/${encodeURIComponent(slug)}?status=draft`,
    { method: "DELETE" },
  );
  if (!result.ok) return result;
  return { ok: true };
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

  const result = await fetchSimpleJson(`/internal-api/tags?${params.toString()}`);
  if (!result.ok) return result;
  return { ok: true, tags: normalizeTagOptions(result.raw) };
}

export async function requestSeriesList(): Promise<SeriesListResult> {
  const params = new URLSearchParams({
    include_private: "true",
    limit: "200",
    offset: "0",
  });

  const result = await fetchSimpleJson(`/internal-api/series?${params.toString()}`);
  if (!result.ok) return result;
  return { ok: true, series: normalizeSeriesList(result.raw) };
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

export async function requestAdminLogin(
  username: string,
  password: string,
): Promise<AdminLoginResult> {
  const response = await fetch("/internal-api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: username.trim(),
      password,
    }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as unknown;
    return {
      ok: false,
      status: response.status,
      errorPayload,
    };
  }

  return { ok: true };
}

export function normalizeAdminPostPayload(raw: unknown): Partial<AdminPostPayload> {
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
    top_media_kind:
      payload.top_media_kind === "youtube"
        ? "youtube"
        : payload.top_media_kind === "video"
          ? "video"
          : "image",
    top_media_image_url:
      typeof payload.top_media_image_url === "string" || payload.top_media_image_url === null
        ? payload.top_media_image_url
        : undefined,
    top_media_youtube_url:
      typeof payload.top_media_youtube_url === "string" || payload.top_media_youtube_url === null
        ? payload.top_media_youtube_url
        : undefined,
    top_media_video_url:
      typeof payload.top_media_video_url === "string" || payload.top_media_video_url === null
        ? payload.top_media_video_url
        : undefined,
    content_kind:
      payload.content_kind === "project" ? "project" : "blog",
    series_title:
      typeof payload.series_title === "string" || payload.series_title === null
        ? payload.series_title
        : undefined,
    status: payload.status === "published" ? "published" : "draft",
    visibility: payload.visibility === "private" ? "private" : "public",
    tags: normalizeTagSlugs(payload.tags),
    series_context: normalizeSeriesContext(payload.series_context),
    project_profile: normalizeProjectProfile(payload.project_profile),
  };
}

function normalizeTagOptions(raw: unknown): AdminTagOption[] {
  if (!Array.isArray(raw)) return [];
  const tags: AdminTagOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const slug = typeof (item as { slug?: unknown }).slug === "string"
      ? (item as { slug: string }).slug.trim().toLowerCase()
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
      slug = item.trim().toLowerCase();
    } else if (item && typeof item === "object" && typeof (item as { slug?: unknown }).slug === "string") {
      slug = (item as { slug: string }).slug.trim().toLowerCase();
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
  const series_slug = value.series_slug.trim();
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
    const slug = typeof value.slug === "string" ? value.slug.trim() : "";
    const title = typeof value.title === "string" ? value.title.trim() : "";
    if (!slug || !title || seen.has(slug)) continue;
    seen.add(slug);
    items.push({ slug, title });
  }
  return items;
}

function normalizeProjectProfile(raw: unknown): AdminProjectProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  return {
    period_label: typeof value.period_label === "string" ? value.period_label.trim() : "",
    role_summary: typeof value.role_summary === "string" ? value.role_summary.trim() : "",
    project_intro:
      typeof value.project_intro === "string" || value.project_intro === null
        ? value.project_intro
        : null,
    card_image_url:
      typeof value.card_image_url === "string" || value.card_image_url === null
        ? value.card_image_url
        : null,
    highlights_json: Array.isArray(value.highlights_json)
      ? value.highlights_json.filter((item): item is string => typeof item === "string")
      : Array.isArray(value.highlights)
        ? value.highlights.filter((item): item is string => typeof item === "string")
        : [],
    resource_links_json: Array.isArray(value.resource_links_json)
      ? value.resource_links_json.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const link = item as Record<string, unknown>;
          if (typeof link.label !== "string" || typeof link.href !== "string") return [];
          return [{ label: link.label, href: link.href }];
        })
      : Array.isArray(value.resource_links)
        ? value.resource_links.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const link = item as Record<string, unknown>;
          if (typeof link.label !== "string" || typeof link.href !== "string") return [];
          return [{ label: link.label, href: link.href }];
        })
      : [],
  };
}
