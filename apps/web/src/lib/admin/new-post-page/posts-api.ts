import type { AdminPostPayload } from "./types";
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
    const payload = (await response.json()) as Partial<AdminPostPayload>;
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
