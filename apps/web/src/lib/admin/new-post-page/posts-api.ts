import type { AdminPostPayload, AdminTagOption } from "./types";
import type { SubmitPayload, SubmitRequestInfo } from "./submit";

export type DraftLoadFailureKind = "not_found" | "http_error" | "network_error";

export type DraftLoadResult =
  | {
      ok: true;
      payload: Partial<AdminPostPayload>;
    }
  | {
      ok: false;
      reason: DraftLoadFailureKind;
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

export interface SubmitCreatedPost {
  slug: string;
  status: string;
}

export type SubmitPostResult =
  | { ok: true; created: SubmitCreatedPost }
  | { ok: false; status: number; errorPayload: unknown };

export async function requestDraftBySlug(slug: string): Promise<DraftLoadResult> {
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
    status: payload.status === "published" ? "published" : "draft",
    visibility: payload.visibility === "private" ? "private" : "public",
    tags: normalizeTagSlugs(payload.tags),
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
