import { requestBackend, resolveBackendAssetUrl } from "./backend-api";
import { createMarkdownRenderer } from "./markdown-renderer";

export interface ProjectLink {
  label: string;
  href: string;
}

export interface ProjectTag {
  slug: string;
  label: string;
}

export interface RelatedSeriesPost {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl?: string;
  orderIndex: number;
  publishedAt?: Date;
  visibility: "public" | "private";
}

export interface ProjectItem {
  id: string;
  slug: string;
  locale?: string;
  title: string;
  summary: string;
  description: string;
  seriesTitle?: string;
  role: string;
  period: string;
  intro: string;
  stack: string[];
  coverImageUrl?: string;
  topMediaKind: "image" | "youtube" | "video";
  topMediaImageUrl?: string;
  topMediaYoutubeUrl?: string;
  topMediaVideoUrl?: string;
  highlights: string[];
  links: ProjectLink[];
  relatedSeriesPosts: RelatedSeriesPost[];
}

interface DbProjectLink {
  label: string;
  href: string;
}

interface DbProjectProfile {
  period_label: string;
  role_summary: string;
  project_intro: string | null;
  card_image_url: string;
  highlights_json: string[];
  resource_links_json: DbProjectLink[];
}

interface DbProjectTag {
  slug: string;
  label: string;
}

interface DbRelatedSeriesPost {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  order_index: number;
  published_at: string | null;
  visibility: "public" | "private";
}

interface DbProjectPost {
  id: string;
  slug: string;
  locale?: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  top_media_kind: "image" | "youtube" | "video";
  top_media_image_url: string | null;
  top_media_youtube_url: string | null;
  top_media_video_url: string | null;
  series_title: string | null;
  content_kind: "project";
  tags: DbProjectTag[];
  project_profile: DbProjectProfile;
  related_series_posts?: DbRelatedSeriesPost[];
}

const markdown = createMarkdownRenderer();

function toProjectItem(project: DbProjectPost): ProjectItem {
  const profile = project.project_profile;
  return {
    id: project.id,
    slug: project.slug,
    locale: project.locale,
    title: project.title,
    summary: project.excerpt?.trim() ?? "",
    intro: profile.project_intro?.trim() ?? "",
    description: markdown.render(project.body_markdown),
    seriesTitle: project.series_title?.trim() || undefined,
    role: profile.role_summary,
    period: profile.period_label,
    stack: Array.isArray(project.tags) ? project.tags.map((tag) => tag.label || tag.slug) : [],
    coverImageUrl: resolveBackendAssetUrl(profile.card_image_url || project.cover_image_url || undefined),
    topMediaKind: project.top_media_kind ?? "image",
    topMediaImageUrl: resolveBackendAssetUrl(
      project.top_media_image_url || profile.card_image_url || project.cover_image_url || undefined,
    ),
    topMediaYoutubeUrl: project.top_media_youtube_url ?? undefined,
    topMediaVideoUrl: resolveBackendAssetUrl(project.top_media_video_url || undefined),
    highlights: Array.isArray(profile.highlights_json) ? profile.highlights_json : [],
    links: Array.isArray(profile.resource_links_json) ? profile.resource_links_json : [],
    relatedSeriesPosts: Array.isArray(project.related_series_posts)
      ? project.related_series_posts.map((post) => ({
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt?.trim() ?? "",
          coverImageUrl: resolveBackendAssetUrl(post.cover_image_url || undefined),
          orderIndex: post.order_index,
          publishedAt: post.published_at ? new Date(post.published_at) : undefined,
          visibility: post.visibility === "private" ? "private" : "public",
        }))
      : [],
  };
}

interface ListProjectsOptions {
  limit?: number;
  offset?: number;
  locale?: string;
}

export async function listPublishedDbProjects(
  options: ListProjectsOptions = {},
): Promise<ProjectItem[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const normalizedLocale = options.locale?.trim().toLowerCase() ?? "";
  if (normalizedLocale) {
    params.set("locale", normalizedLocale);
  }
  const response = await requestBackend(`/projects?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`failed to fetch projects: ${response.status}`);
  }

  const payload = (await response.json()) as DbProjectPost[];
  return payload.map(toProjectItem);
}

interface GetProjectOptions {
  locale?: string;
}

export async function getPublishedDbProjectBySlug(
  slug: string,
  options: GetProjectOptions = {},
): Promise<ProjectItem | null> {
  const params = new URLSearchParams();
  const normalizedLocale = options.locale?.trim().toLowerCase() ?? "";
  if (normalizedLocale) {
    params.set("locale", normalizedLocale);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await requestBackend(`/projects/${encodeURIComponent(slug)}${query}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`failed to fetch project detail: ${response.status}`);
  }

  const payload = (await response.json()) as DbProjectPost;
  return toProjectItem(payload);
}

export async function resolveProjectSlugRedirect(
  slug: string,
  locale: string,
): Promise<string | null> {
  const params = new URLSearchParams({ locale });
  const response = await requestBackend(
    `/projects/redirects/${encodeURIComponent(slug)}?${params.toString()}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to resolve project redirect: ${response.status}`);
  }
  const body = (await response.json()) as { target_slug?: string };
  return body.target_slug ?? null;
}
