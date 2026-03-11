import type {
  AdminPostPayload,
  AdminProjectProfile,
  AdminSeriesContext,
  AdminTagOption,
} from "./types";
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

type SeriesListResult =
  | { ok: true; series: SeriesListItem[] }
  | { ok: false; reason: "http_error" | "network_error" };

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
  if (
    typeof value.period_label !== "string" ||
    typeof value.role_summary !== "string" ||
    typeof value.card_image_url !== "string"
  ) {
    return null;
  }
  return {
    period_label: value.period_label.trim(),
    role_summary: value.role_summary.trim(),
    project_intro:
      typeof value.project_intro === "string" || value.project_intro === null
        ? value.project_intro
        : null,
    card_image_url: value.card_image_url.trim(),
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
      : [],
  };
}
