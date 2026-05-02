import type { getPublishedDbPostBySlug } from "../blog-db";
import { getSeriesBySlug } from "../series-db";

type DbPost = NonNullable<Awaited<ReturnType<typeof getPublishedDbPostBySlug>>>;

export interface SeriesSidebarItem {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl?: string;
  relation: "prev" | "next";
}

/**
 * Builds the prev/next post entries used by the series sidebar on a blog
 * detail page. Resolves the parent series and looks up the prev/next post
 * metadata so the sidebar can render accurate titles, excerpts, and
 * covers. Returns an empty array on any failure or when the post has no
 * series context.
 */
export async function loadSeriesSidebarPosts(
  dbPost: DbPost,
  options: { includePrivate: boolean },
): Promise<SeriesSidebarItem[]> {
  const seriesSlug = dbPost.seriesContext?.seriesSlug?.trim() ?? "";
  if (seriesSlug.length === 0) {
    return [];
  }

  let detail: Awaited<ReturnType<typeof getSeriesBySlug>> | null = null;
  try {
    detail = await getSeriesBySlug(seriesSlug, {
      includePrivate: options.includePrivate,
    });
  } catch {
    return [];
  }

  if (!detail?.posts?.length) {
    return [];
  }

  const bySlug = new Map(
    detail.posts.map((post) => [
      post.slug,
      {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt ?? "",
        coverImageUrl: post.coverImageUrl,
      },
    ]),
  );

  const result: SeriesSidebarItem[] = [];
  const prevPostSlug = dbPost.seriesContext?.prevPostSlug?.trim() ?? "";
  const nextPostSlug = dbPost.seriesContext?.nextPostSlug?.trim() ?? "";

  if (prevPostSlug.length > 0) {
    const prevPost = bySlug.get(prevPostSlug);
    result.push({
      slug: prevPostSlug,
      title:
        prevPost?.title ?? dbPost.seriesContext?.prevPostTitle ?? prevPostSlug,
      excerpt: prevPost?.excerpt ?? "",
      coverImageUrl: prevPost?.coverImageUrl,
      relation: "prev",
    });
  }

  if (nextPostSlug.length > 0) {
    const nextPost = bySlug.get(nextPostSlug);
    result.push({
      slug: nextPostSlug,
      title:
        nextPost?.title ?? dbPost.seriesContext?.nextPostTitle ?? nextPostSlug,
      excerpt: nextPost?.excerpt ?? "",
      coverImageUrl: nextPost?.coverImageUrl,
      relation: "next",
    });
  }

  return result;
}
