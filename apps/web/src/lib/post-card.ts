import type { CoverMedia } from "./cover-media";

export interface PostCard {
    slug: string;
    title: string;
    description: string;
    body?: string;
    readingLabel?: string;
    commentCount?: number;
    pubDate: Date;
    updatedDate?: Date;
    coverMedia?: CoverMedia;
    visibility?: 'public' | 'private';
    tags?: string[];
}
