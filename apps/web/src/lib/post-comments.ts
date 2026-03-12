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
