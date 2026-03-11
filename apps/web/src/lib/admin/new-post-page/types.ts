export type PostStatus = "draft" | "published";
export type PostVisibility = "public" | "private";
export type PostContentKind = "blog" | "project";
export type ProjectDetailMediaKind = "image" | "youtube" | "video";
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
  content_kind?: PostContentKind;
  series_title?: string | null;
  status: PostStatus;
  visibility: PostVisibility;
  tags: string[];
  series_context?: AdminSeriesContext | null;
  project_profile?: AdminProjectProfile | null;
}

export interface AdminTagOption {
  slug: string;
  label: string;
}

export interface AdminSeriesContext {
  series_slug: string;
  series_title: string;
}

export interface AdminProjectResourceLink {
  label: string;
  href: string;
}

export interface AdminProjectProfile {
  period_label: string;
  role_summary: string;
  project_intro?: string | null;
  card_image_url: string;
  detail_media_kind: ProjectDetailMediaKind;
  detail_image_url: string | null;
  youtube_url: string | null;
  detail_video_url?: string | null;
  highlights_json?: string[];
  highlights?: string[];
  resource_links_json?: AdminProjectResourceLink[];
  resource_links?: AdminProjectResourceLink[];
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
