export type CommentAuthorType = "guest" | "admin";
export type CommentVisibility = "public" | "private";
export type CommentStatus = "active" | "deleted";

export interface PostCommentItem {
  id: string;
  root_comment_id: string | null;
  reply_to_comment_id: string | null;
  author_name: string;
  author_type: CommentAuthorType;
  visibility: CommentVisibility;
  status: CommentStatus;
  body: string;
  can_reply: boolean;
  reply_to_author_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostCommentThreadItem extends PostCommentItem {
  replies: PostCommentItem[];
}

export interface PostCommentThreadList {
  comment_count: number;
  items: PostCommentThreadItem[];
}

export interface PostCommentCreatePayload {
  author_name?: string;
  password?: string;
  visibility: CommentVisibility;
  body: string;
  reply_to_comment_id?: string;
}

export interface PostCommentUpdatePayload {
  password?: string;
  visibility?: CommentVisibility;
  body?: string;
}

export interface PostCommentDeletePayload {
  password?: string;
}

export interface AdminCommentFeedItem extends PostCommentItem {
  post_slug: string;
  post_title: string;
  is_reply: boolean;
}

export interface AdminCommentFeed {
  total_count: number;
  items: AdminCommentFeedItem[];
}

const EMPTY_COMMENT_THREAD_LIST: PostCommentThreadList = {
  comment_count: 0,
  items: [],
};

/**
 * Returns a stable empty thread list. Used as the initial-state fallback
 * when comments cannot be fetched on the server.
 */
export function emptyPostCommentThreadList(): PostCommentThreadList {
  return EMPTY_COMMENT_THREAD_LIST;
}

/**
 * Server-side fetch of the initial comments for a post detail page.
 * Routes through the authenticated `requestBackend` when the viewer is
 * an admin (so private comments are visible) and the public proxy
 * otherwise. Any failure resolves to an empty thread list.
 */
export async function fetchInitialPostComments(
  postSlug: string,
  options: { includePrivate: boolean },
): Promise<PostCommentThreadList> {
  // Imports are scoped here to avoid pulling backend client modules into
  // bundles that only need the comment types.
  const { buildBackendApiUrl, requestBackend } = await import("./backend-api");
  const { serverLogger } = await import("./server/logging");

  const path = `/posts/${encodeURIComponent(postSlug)}/comments`;
  serverLogger.debug("comment.thread_initial_requested", {
    post_slug: postSlug,
    include_private: options.includePrivate,
  });
  try {
    const response = options.includePrivate
      ? await requestBackend(path)
      : await fetch(buildBackendApiUrl(path), { cache: "no-store" });

    if (response.status === 404 || !response.ok) {
      serverLogger.debug("comment.thread_initial_returned", {
        post_slug: postSlug,
        include_private: options.includePrivate,
        status: response.status,
        fallback_empty: true,
      });
      return EMPTY_COMMENT_THREAD_LIST;
    }
    const payload = (await response.json()) as PostCommentThreadList;
    serverLogger.debug("comment.thread_initial_returned", {
      post_slug: postSlug,
      include_private: options.includePrivate,
      status: response.status,
      comment_count: payload.comment_count,
      root_count: Array.isArray(payload.items) ? payload.items.length : 0,
    });
    return payload;
  } catch (error) {
    serverLogger.debug("comment.thread_initial_failed", {
      post_slug: postSlug,
      include_private: options.includePrivate,
      error,
    });
    return EMPTY_COMMENT_THREAD_LIST;
  }
}
