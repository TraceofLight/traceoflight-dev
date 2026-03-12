import {getCollection, type CollectionEntry} from 'astro:content';
import { normalizeCoverMedia, type CoverMedia } from './cover-media';

export type BlogEntry = CollectionEntry<'blog'>;

export interface PostCard {
    slug: string;
    title: string;
    description: string;
    body?: string;
    commentCount?: number;
    pubDate: Date;
    updatedDate?: Date;
    coverMedia?: CoverMedia;
    visibility?: 'public' | 'private';
    tags?: string[];
}

export interface BlogContentSource {
    listPosts(): Promise<BlogEntry[]>;

    getPostBySlug(slug: string): Promise<BlogEntry | null>;
}

class MarkdownBlogSource implements BlogContentSource {
    async listPosts(): Promise<BlogEntry[]> {
        const posts = await getCollection('blog');
        return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
    }

    async getPostBySlug(slug: string): Promise<BlogEntry | null> {
        const matchedPosts = await getCollection('blog', ({id}) => id === slug);
        return matchedPosts[0] ?? null;
    }
}

function normalizeProvider(value: string | undefined): 'file' | 'db' | null {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'db') return 'db';
    if (normalized === 'file') return 'file';
    return null;
}

function resolveContentProvider(): 'file' | 'db' {
    const runtimeProvider = normalizeProvider(process.env.CONTENT_PROVIDER);
    if (runtimeProvider) return runtimeProvider;
    const buildTimeProvider = normalizeProvider(import.meta.env.CONTENT_PROVIDER);
    if (buildTimeProvider) return buildTimeProvider;
    return 'db';
}

const markdownBlogSource = new MarkdownBlogSource();

export function getBlogSource(): BlogContentSource {
    return markdownBlogSource;
}

export function getContentProvider(): 'file' | 'db' {
    return resolveContentProvider();
}

export function toPostCard(post: BlogEntry): PostCard {
    return {
        slug: post.id,
        title: post.data.title,
        description: post.data.description,
        body: post.body,
        commentCount: 0,
        pubDate: post.data.pubDate,
        updatedDate: post.data.updatedDate,
        coverMedia: normalizeCoverMedia(post.data.coverImage),
        visibility: 'public',
        tags: [],
    };
}
