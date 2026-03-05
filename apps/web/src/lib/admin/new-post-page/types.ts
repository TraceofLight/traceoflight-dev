export type PostStatus = "draft" | "published";
export type PostVisibility = "public" | "private";
export type AssetKind = "image" | "video" | "file";

export interface UploadUrlResponse {
  object_key: string;
  bucket: string;
  upload_url: string;
  expires_in_seconds: number;
}

export interface UploadBundle {
  mediaUrl: string;
  snippet: string;
}

export interface AdminPostPayload {
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  status: PostStatus;
  visibility: PostVisibility;
  tags: string[];
}

export interface AdminTagOption {
  slug: string;
  label: string;
}

export interface AdminDraftListItem {
  slug: string;
  title?: string | null;
  status?: string;
  visibility?: PostVisibility;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EditorBridge {
  mode: "crepe" | "fallback";
  initError?: string;
  getMarkdown: () => Promise<string>;
  setMarkdown: (markdown: string) => Promise<void>;
  observeChanges: (onChange: () => void) => () => void;
}

export type DropTarget = "body" | "cover" | null;
export type CompactView = "editor" | "preview";
