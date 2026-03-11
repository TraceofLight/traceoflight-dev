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
  title: string;
  summary: string;
  description: string;
  seriesTitle?: string;
  role: string;
  period: string;
  stack: string[];
  coverImageUrl?: string;
  detailMediaKind: "image" | "youtube";
  detailImageUrl?: string;
  youtubeUrl?: string;
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
  card_image_url: string;
  detail_media_kind: "image" | "youtube";
  detail_image_url: string | null;
  youtube_url: string | null;
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
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
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
    title: project.title,
    summary: project.excerpt?.trim() ?? "",
    description: markdown.render(project.body_markdown),
    seriesTitle: project.series_title?.trim() || undefined,
    role: profile.role_summary,
    period: profile.period_label,
    stack: Array.isArray(project.tags) ? project.tags.map((tag) => tag.label || tag.slug) : [],
    coverImageUrl: resolveBackendAssetUrl(profile.card_image_url || project.cover_image_url || undefined),
    detailMediaKind: profile.detail_media_kind,
    detailImageUrl: resolveBackendAssetUrl(profile.detail_image_url || project.cover_image_url || undefined),
    youtubeUrl: profile.youtube_url ?? undefined,
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

export async function listPublishedDbProjects(limit = 50): Promise<ProjectItem[]> {
  const response = await requestBackend(`/projects?limit=${limit}&offset=0`);
  if (!response.ok) {
    throw new Error(`failed to fetch projects: ${response.status}`);
  }

  const payload = (await response.json()) as DbProjectPost[];
  return payload.map(toProjectItem);
}

export async function getPublishedDbProjectBySlug(slug: string): Promise<ProjectItem | null> {
  const response = await requestBackend(`/projects/${encodeURIComponent(slug)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`failed to fetch project detail: ${response.status}`);
  }

  const payload = (await response.json()) as DbProjectPost;
  return toProjectItem(payload);
}
