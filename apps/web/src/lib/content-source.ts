import {getCollection, type CollectionEntry} from 'astro:content';
import type {ImageMetadata} from 'astro';

export type BlogEntry = CollectionEntry<'blog'>;

export interface PostCard {
    slug: string;
    title: string;
    description: string;
    pubDate: Date;
    updatedDate?: Date;
    heroImage?: ImageMetadata | string;
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

class DbBlogSourceFallback implements BlogContentSource {
    private readonly markdown = new MarkdownBlogSource();

    async listPosts(): Promise<BlogEntry[]> {
        // TODO(KHJ): Replace with DB query when local instance schema is ready.
        return this.markdown.listPosts();
    }

    async getPostBySlug(slug: string): Promise<BlogEntry | null> {
        // TODO(KHJ): Replace with DB query when local instance schema is ready.
        return this.markdown.getPostBySlug(slug);
    }
}

function createBlogSource(): BlogContentSource {
    const provider = (import.meta.env.CONTENT_PROVIDER ?? 'file').toLowerCase();
    return provider === 'db' ? new DbBlogSourceFallback() : new MarkdownBlogSource();
}

const blogSource = createBlogSource();

export function getBlogSource(): BlogContentSource {
    return blogSource;
}

export function getContentProvider(): 'file' | 'db' {
    const provider = (import.meta.env.CONTENT_PROVIDER ?? 'file').toLowerCase();
    return provider === 'db' ? 'db' : 'file';
}

export function toPostCard(post: BlogEntry): PostCard {
    return {
        slug: post.id,
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        updatedDate: post.data.updatedDate,
        heroImage: post.data.heroImage,
    };
}
