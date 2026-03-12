import { requestBackend, resolveBackendAssetUrl } from './backend-api';
import { createMarkdownRenderer } from './markdown-renderer';
import {
  normalizeCoverMedia,
  normalizeOptionalImageUrl,
  type CoverMedia,
} from './cover-media';

export interface DbPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  top_media_kind?: "image" | "youtube" | "video";
  top_media_image_url?: string | null;
  top_media_youtube_url?: string | null;
  top_media_video_url?: string | null;
  status: 'draft' | 'published' | 'archived';
  visibility?: 'public' | 'private';
  tags: DbTag[];
  comment_count?: number;
  series_context?: DbSeriesContextRaw | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTag {
  slug: string;
  label: string;
}

export interface DbBlogPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  bodyMarkdown: string;
  commentCount: number;
  coverImageUrl?: string;
  coverMedia?: CoverMedia;
  topMediaKind: 'image' | 'youtube' | 'video';
  topMediaImageUrl?: string;
  topMediaYoutubeUrl?: string;
  topMediaVideoUrl?: string;
  visibility: 'public' | 'private';
  tags: DbTag[];
  seriesContext?: DbSeriesContext;
  publishedAt: Date;
  updatedAt?: Date;
}

export interface DbSeriesContextRaw {
  series_slug: string;
  series_title: string;
  order_index: number;
  total_posts: number;
  prev_post_slug: string | null;
  prev_post_title: string | null;
  next_post_slug: string | null;
  next_post_title: string | null;
}

export interface DbSeriesContext {
  seriesSlug: string;
  seriesTitle: string;
  orderIndex: number;
  totalPosts: number;
  prevPostSlug: string | null;
  prevPostTitle: string | null;
  nextPostSlug: string | null;
  nextPostTitle: string | null;
}

const markdown = createMarkdownRenderer();

interface PublishedQueryOptions {
  includePrivate?: boolean;
}

const POSTS_PAGE_SIZE = 100;

function toDbBlogPost(post: DbPost): DbBlogPost {
  const publishedDate = post.published_at ?? post.created_at;
  const normalizedCoverImageUrl = normalizeOptionalImageUrl(post.cover_image_url);
  const resolvedCoverImageUrl = resolveBackendAssetUrl(normalizedCoverImageUrl);
  const resolvedTopMediaImageUrl = resolveBackendAssetUrl(
    normalizeOptionalImageUrl(post.top_media_image_url ?? post.cover_image_url),
  );
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.excerpt?.trim() ?? '',
    bodyMarkdown: post.body_markdown,
    commentCount: post.comment_count ?? 0,
    coverImageUrl: resolvedCoverImageUrl,
    coverMedia: normalizeCoverMedia(resolvedCoverImageUrl),
    topMediaKind: post.top_media_kind === 'youtube' ? 'youtube' : post.top_media_kind === 'video' ? 'video' : 'image',
    topMediaImageUrl: resolvedTopMediaImageUrl,
    topMediaYoutubeUrl: post.top_media_youtube_url ?? undefined,
    topMediaVideoUrl: resolveBackendAssetUrl(normalizeOptionalImageUrl(post.top_media_video_url)),
    visibility: post.visibility === 'private' ? 'private' : 'public',
    tags: Array.isArray(post.tags) ? post.tags : [],
    seriesContext: post.series_context
      ? {
          seriesSlug: post.series_context.series_slug,
          seriesTitle: post.series_context.series_title,
          orderIndex: post.series_context.order_index,
          totalPosts: post.series_context.total_posts,
          prevPostSlug: post.series_context.prev_post_slug,
          prevPostTitle: post.series_context.prev_post_title,
          nextPostSlug: post.series_context.next_post_slug,
          nextPostTitle: post.series_context.next_post_title,
        }
      : undefined,
    publishedAt: new Date(publishedDate),
    updatedAt: post.updated_at ? new Date(post.updated_at) : undefined,
  };
}

function buildPublishedPostsQuery(
  limit: number,
  options: PublishedQueryOptions = {},
  offset = 0,
): string {
  const params = new URLSearchParams({
    status: 'published',
    limit: String(limit),
    offset: String(offset),
  });

  if (!options.includePrivate) {
    params.set('visibility', 'public');
  }

  return `/posts?${params.toString()}`;
}

export async function listPublishedDbPosts(limit = 50, options: PublishedQueryOptions = {}): Promise<DbBlogPost[]> {
  const response = await requestBackend(buildPublishedPostsQuery(limit, options));
  if (!response.ok) {
    throw new Error(`failed to fetch posts: ${response.status}`);
  }

  const posts = (await response.json()) as DbPost[];
  return posts.map(toDbBlogPost);
}

export async function listAllPublishedDbPosts(
  options: PublishedQueryOptions = {},
): Promise<DbBlogPost[]> {
  const allPosts: DbBlogPost[] = [];
  let offset = 0;

  while (true) {
    const response = await requestBackend(buildPublishedPostsQuery(POSTS_PAGE_SIZE, options, offset));
    if (!response.ok) {
      throw new Error(`failed to fetch posts: ${response.status}`);
    }

    const posts = (await response.json()) as DbPost[];
    allPosts.push(...posts.map(toDbBlogPost));

    if (posts.length < POSTS_PAGE_SIZE) {
      break;
    }

    offset += POSTS_PAGE_SIZE;
  }

  return allPosts;
}

export async function getPublishedDbPostBySlug(
  slug: string,
  options: PublishedQueryOptions = {},
): Promise<DbBlogPost | null> {
  const params = new URLSearchParams({ status: 'published' });
  if (!options.includePrivate) {
    params.set('visibility', 'public');
  }

  const response = await requestBackend(`/posts/${encodeURIComponent(slug)}?${params.toString()}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to fetch post: ${response.status}`);
  }

  const post = (await response.json()) as DbPost;
  return toDbBlogPost(post);
}

export function renderDbMarkdown(markdownSource: string): string {
  return markdown.render(markdownSource);
}
