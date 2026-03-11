import type {
  PostContentKind,
  PostStatus,
  PostVisibility,
  ProjectDetailMediaKind,
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
  contentKind: PostContentKind;
  seriesTitle: string;
  status: PostStatus;
  visibility: PostVisibility;
  tags: string[];
  nowIso: string;
  projectPeriod: string;
  projectRoleSummary: string;
  projectIntro: string;
  projectDetailMediaKind: ProjectDetailMediaKind;
  projectYoutubeUrl: string;
  projectDetailVideoUrl: string;
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
    detail_media_kind: ProjectDetailMediaKind;
    detail_image_url: string | null;
    youtube_url: string | null;
    detail_video_url: string | null;
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
    contentKind,
    seriesTitle,
    status,
    visibility,
    tags,
    nowIso,
    projectPeriod,
    projectRoleSummary,
    projectIntro,
    projectDetailMediaKind,
    projectYoutubeUrl,
    projectDetailVideoUrl,
    projectHighlights,
    projectResourceLinks,
  } = input;
  const normalizedCoverImageUrl = coverImageUrl.trim() || null;
  const isProject = contentKind === "project";
  return {
    slug,
    title,
    excerpt: excerpt.trim() || null,
    body_markdown: bodyMarkdown,
    cover_image_url: normalizedCoverImageUrl,
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
          detail_media_kind: projectDetailMediaKind,
          detail_image_url:
            projectDetailMediaKind === "image"
              ? normalizedCoverImageUrl
              : null,
          youtube_url:
            projectDetailMediaKind === "youtube"
              ? projectYoutubeUrl.trim() || null
              : null,
          detail_video_url:
            projectDetailMediaKind === "video"
              ? projectDetailVideoUrl.trim() || null
              : null,
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
