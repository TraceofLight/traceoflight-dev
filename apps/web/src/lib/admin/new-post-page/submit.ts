import type {
  PostContentKind,
  PostStatus,
  PostTopMediaKind,
  PostVisibility,
} from "./types";

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
  topMediaKind: PostTopMediaKind;
  topMediaImageUrl: string;
  topMediaYoutubeUrl: string;
  topMediaVideoUrl: string;
  contentKind: PostContentKind;
  seriesTitle: string;
  status: PostStatus;
  visibility: PostVisibility;
  tags: string[];
  nowIso: string;
  projectPeriod: string;
  projectRoleSummary: string;
  projectIntro: string;
  projectHighlights: string;
  projectResourceLinks: string;
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
  top_media_kind: PostTopMediaKind;
  top_media_image_url: string | null;
  top_media_youtube_url: string | null;
  top_media_video_url: string | null;
  content_kind: PostContentKind;
  series_title: string | null;
  status: PostStatus;
  visibility: PostVisibility;
  tags: string[];
  published_at: string | null;
  project_profile: {
    period_label: string;
    role_summary: string;
    project_intro: string | null;
    card_image_url: string;
    highlights: string[];
    resource_links: { label: string; href: string }[];
  } | null;
}

function parseMultilineValues(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProjectResourceLinks(
  raw: string,
): { label: string; href: string }[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [label, href] = line.split("|").map((part) => part.trim());
      if (!label || !href) return [];
      return [{ label, href }];
    });
}

export function resolveSubmitStatus(input: SubmitStatusInput): PostStatus {
  const { desiredStatus } = input;
  if (desiredStatus === "published") return "published";
  return "draft";
}

export function buildSubmitPayload(input: SubmitPayloadInput): SubmitPayload {
  const {
    slug,
    title,
    excerpt,
    bodyMarkdown,
    coverImageUrl,
    topMediaKind,
    topMediaImageUrl,
    topMediaYoutubeUrl,
    topMediaVideoUrl,
    contentKind,
    seriesTitle,
    status,
    visibility,
    tags,
    nowIso,
    projectPeriod,
    projectRoleSummary,
    projectIntro,
    projectHighlights,
    projectResourceLinks,
  } = input;
  const normalizedCoverImageUrl = coverImageUrl.trim() || null;
  const normalizedTopMediaKind = topMediaKind;
  const normalizedTopMediaImageUrl =
    normalizedTopMediaKind === "image"
      ? topMediaImageUrl.trim() || normalizedCoverImageUrl
      : null;
  const normalizedTopMediaYoutubeUrl =
    normalizedTopMediaKind === "youtube" ? topMediaYoutubeUrl.trim() || null : null;
  const normalizedTopMediaVideoUrl =
    normalizedTopMediaKind === "video" ? topMediaVideoUrl.trim() || null : null;
  const isProject = contentKind === "project";
  return {
    slug,
    title,
    excerpt: excerpt.trim() || null,
    body_markdown: bodyMarkdown,
    cover_image_url: normalizedCoverImageUrl,
    top_media_kind: normalizedTopMediaKind,
    top_media_image_url: normalizedTopMediaImageUrl,
    top_media_youtube_url: normalizedTopMediaYoutubeUrl,
    top_media_video_url: normalizedTopMediaVideoUrl,
    content_kind: contentKind,
    series_title: seriesTitle.trim() || null,
    status,
    visibility,
    tags,
    published_at: status === "published" ? nowIso : null,
    project_profile: isProject
      ? {
          period_label: projectPeriod.trim(),
          role_summary: projectRoleSummary.trim(),
          project_intro: projectIntro.trim() || null,
          card_image_url: normalizedCoverImageUrl ?? "",
          highlights: parseMultilineValues(projectHighlights),
          resource_links: parseProjectResourceLinks(projectResourceLinks),
        }
      : null,
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
