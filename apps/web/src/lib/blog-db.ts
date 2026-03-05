import { requestBackend } from './backend-api';
import { createMarkdownRenderer } from './markdown-renderer';

export interface DbPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  status: 'draft' | 'published' | 'archived';
  visibility?: 'public' | 'private';
  tags: DbTag[];
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
  coverImageUrl?: string;
  visibility: 'public' | 'private';
  tags: DbTag[];
  publishedAt: Date;
  updatedAt?: Date;
}

const markdown = createMarkdownRenderer();

interface PublishedQueryOptions {
  includePrivate?: boolean;
}

function toDbBlogPost(post: DbPost): DbBlogPost {
  const publishedDate = post.published_at ?? post.created_at;
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.excerpt?.trim() ?? '',
    bodyMarkdown: post.body_markdown,
    coverImageUrl: post.cover_image_url ?? undefined,
    visibility: post.visibility === 'private' ? 'private' : 'public',
    tags: Array.isArray(post.tags) ? post.tags : [],
    publishedAt: new Date(publishedDate),
    updatedAt: post.updated_at ? new Date(post.updated_at) : undefined,
  };
}

function buildPublishedPostsQuery(limit: number, options: PublishedQueryOptions = {}): string {
  const params = new URLSearchParams({
    status: 'published',
    limit: String(limit),
    offset: '0',
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
