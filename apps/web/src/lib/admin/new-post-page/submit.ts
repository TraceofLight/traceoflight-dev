import type { PostStatus, PostVisibility } from "./types";

export interface SubmitStatusInput {
  desiredStatus: string | null;
  submitterIsNull: boolean;
  publishLayerOpen: boolean;
}

export interface SubmitPayloadInput {
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  coverImageUrl: string;
  seriesTitle: string;
  status: PostStatus;
  visibility: PostVisibility;
  tags: string[];
  nowIso: string;
}

export interface SubmitRequestInfo {
  path: string;
  method: "POST" | "PUT";
}

export interface SubmitPayload {
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  series_title: string | null;
  status: PostStatus;
  visibility: PostVisibility;
  tags: string[];
  published_at: string | null;
}

export function resolveSubmitStatus(input: SubmitStatusInput): PostStatus {
  const { desiredStatus, submitterIsNull, publishLayerOpen } = input;
  if (desiredStatus === "published") return "published";
  if (submitterIsNull && publishLayerOpen) return "published";
  return "draft";
}

export function buildSubmitPayload(input: SubmitPayloadInput): SubmitPayload {
  const {
    slug,
    title,
    excerpt,
    bodyMarkdown,
    coverImageUrl,
    seriesTitle,
    status,
    visibility,
    tags,
    nowIso,
  } = input;
  return {
    slug,
    title,
    excerpt: excerpt.trim() || null,
    body_markdown: bodyMarkdown,
    cover_image_url: coverImageUrl.trim() || null,
    series_title: seriesTitle.trim() || null,
    status,
    visibility,
    tags,
    published_at: status === "published" ? nowIso : null,
  };
}

export function resolveSubmitRequest(
  editingPostSlug: string | null,
): SubmitRequestInfo {
  if (editingPostSlug) {
    return {
      path: `/internal-api/posts/${encodeURIComponent(editingPostSlug)}`,
      method: "PUT",
    };
  }
  return {
    path: "/internal-api/posts",
    method: "POST",
  };
}
