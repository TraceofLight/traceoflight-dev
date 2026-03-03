import MarkdownIt from 'markdown-it';

import { requestBackend } from './backend-api';

export interface DbPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbBlogPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  bodyMarkdown: string;
  coverImageUrl?: string;
  publishedAt: Date;
  updatedAt?: Date;
}

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

function toDbBlogPost(post: DbPost): DbBlogPost {
  const publishedDate = post.published_at ?? post.created_at;
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.excerpt ?? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    bodyMarkdown: post.body_markdown,
    coverImageUrl: post.cover_image_url ?? undefined,
    publishedAt: new Date(publishedDate),
    updatedAt: post.updated_at ? new Date(post.updated_at) : undefined,
  };
}

export async function listPublishedDbPosts(limit = 50): Promise<DbBlogPost[]> {
  const response = await requestBackend(`/posts?status=published&limit=${limit}&offset=0`);
  if (!response.ok) {
    throw new Error(`failed to fetch posts: ${response.status}`);
  }

  const posts = (await response.json()) as DbPost[];
  return posts.map(toDbBlogPost);
}

export async function getPublishedDbPostBySlug(slug: string): Promise<DbBlogPost | null> {
  const response = await requestBackend(`/posts/${slug}?status=published`);
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
