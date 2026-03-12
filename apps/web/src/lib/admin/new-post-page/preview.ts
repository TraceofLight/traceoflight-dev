import type { CompactView } from "./types";
import { toYoutubeEmbedUrl } from "../../youtube";

export interface CoverPreviewElements {
  coverPreview: HTMLElement;
  coverPreviewImage: HTMLImageElement;
  coverPreviewEmpty: HTMLElement;
}

export function renderCoverPreviewEmpty(
  elements: CoverPreviewElements,
  message: string,
): void {
  const { coverPreview, coverPreviewImage, coverPreviewEmpty } = elements;
  coverPreview.setAttribute("data-empty", "true");
  coverPreviewImage.hidden = true;
  coverPreviewImage.removeAttribute("src");
  coverPreviewEmpty.textContent = message;
}

export function renderCoverPreviewImage(
  elements: CoverPreviewElements,
  url: string,
): void {
  const { coverPreview, coverPreviewImage, coverPreviewEmpty } = elements;
  coverPreview.setAttribute("data-empty", "false");
  coverPreviewEmpty.textContent = "";
  coverPreviewImage.hidden = false;
  coverPreviewImage.src = url;
}

export function renderCoverPreview(
  elements: CoverPreviewElements,
  url: string,
): void {
  if (!url) {
    renderCoverPreviewEmpty(
      elements,
      "커버 이미지를 설정하면 여기에 미리보기가 표시됩니다.",
    );
    return;
  }
  renderCoverPreviewImage(elements, url);
}

export function markCoverPreviewLoaded(elements: CoverPreviewElements): void {
  const { coverPreview, coverPreviewImage, coverPreviewEmpty } = elements;
  coverPreview.setAttribute("data-empty", "false");
  coverPreviewEmpty.textContent = "";
  coverPreviewImage.hidden = false;
}

export interface PreviewMetaElements {
  previewMeta: HTMLElement;
  previewMetaKinds: HTMLElement;
  previewMetaSeries: HTMLElement;
  previewMetaProject: HTMLElement;
  previewMetaHighlights: HTMLElement;
  previewMetaLinks: HTMLElement;
}

function renderMetaBlock(
  element: HTMLElement,
  title: string,
  body: string,
  emptyMessage = "입력 전입니다.",
): void {
  const trimmed = body.trim();
  element.hidden = false;
  element.innerHTML = `
    <p class="writer-preview-meta-label">${title}</p>
    <p class="writer-preview-meta-value${trimmed ? "" : " is-empty"}">${escapeHtml(trimmed || emptyMessage)}</p>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RenderPreviewMetaOptions {
  contentKind: "blog" | "project";
  visibility: "public" | "private";
  seriesTitle: string;
  periodLabel: string;
  roleSummary: string;
  projectIntro: string;
  highlights: string[];
  links: string[];
}

export function renderPreviewMeta(
  elements: PreviewMetaElements,
  options: RenderPreviewMetaOptions,
): void {
  const {
    previewMeta,
    previewMetaKinds,
    previewMetaSeries,
    previewMetaProject,
    previewMetaHighlights,
    previewMetaLinks,
  } = elements;
  const {
    contentKind,
    visibility,
    seriesTitle,
    periodLabel,
    roleSummary,
    projectIntro,
    highlights,
    links,
  } = options;

  previewMeta.hidden = false;
  previewMetaKinds.innerHTML = `
    <div class="writer-preview-meta-pill">
      <span class="writer-preview-meta-label">콘텐츠</span>
      <strong class="writer-preview-meta-strong">${contentKind === "project" ? "Project" : "Blog"}</strong>
    </div>
    <div class="writer-preview-meta-pill">
      <span class="writer-preview-meta-label">공개 범위</span>
      <strong class="writer-preview-meta-strong">${visibility === "private" ? "Private" : "Public"}</strong>
    </div>
  `;
  renderMetaBlock(previewMetaSeries, "시리즈", seriesTitle, "시리즈 없음");

  const projectSummary = [
    periodLabel.trim().length > 0 ? `기간: ${periodLabel.trim()}` : "",
    roleSummary.trim().length > 0 ? `역할: ${roleSummary.trim()}` : "",
    projectIntro.trim(),
  ]
    .filter(Boolean)
    .join("\n");
  if (contentKind === "project") {
    renderMetaBlock(
      previewMetaProject,
      "프로젝트 소개",
      projectSummary,
      "프로젝트 소개 입력 전입니다.",
    );
    renderMetaBlock(
      previewMetaHighlights,
      "주요 항목",
      highlights.map((item) => escapeHtml(item)).join("\n"),
      "주요 항목 입력 전입니다.",
    );
    renderMetaBlock(
      previewMetaLinks,
      "관련 링크",
      links.map((item) => escapeHtml(item)).join("\n"),
      "관련 링크 입력 전입니다.",
    );
  } else {
    previewMetaProject.hidden = true;
    previewMetaProject.innerHTML = "";
    previewMetaHighlights.hidden = true;
    previewMetaHighlights.innerHTML = "";
    previewMetaLinks.hidden = true;
    previewMetaLinks.innerHTML = "";
  }
}

export interface RenderPreviewTopMediaOptions {
  kind: "image" | "youtube" | "video";
  imageUrl: string;
  youtubeUrl: string;
  videoUrl: string;
}

export function buildPreviewTopMediaMarkup(
  options: RenderPreviewTopMediaOptions,
): string {
  const imageUrl = options.imageUrl.trim();
  const youtubeUrl = options.youtubeUrl.trim();
  const videoUrl = options.videoUrl.trim();

  if (options.kind === "video" && videoUrl) {
    return `
      <div class="writer-preview-top-media-frame writer-preview-top-media-frame-video">
        <video controls preload="metadata" src="${videoUrl}"></video>
      </div>
    `;
  }

  if (options.kind === "youtube" && youtubeUrl) {
    const embedUrl = toYoutubeEmbedUrl(youtubeUrl);
    if (!embedUrl) return "";
    return `
      <div class="writer-preview-top-media-frame writer-preview-top-media-frame-youtube">
        <iframe
          src="${embedUrl}"
          title="상단 미디어 미리보기"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      </div>
    `;
  }

  if (imageUrl) {
    return `
      <div class="writer-preview-top-media-frame writer-preview-top-media-frame-image">
        <img src="${imageUrl}" alt="상단 미디어 미리보기" />
      </div>
    `;
  }

  return "";
}

export function setCompactToggleLabel(
  compactToggleButton: HTMLButtonElement,
  view: CompactView,
): void {
  const isPreview = view === "preview";
  compactToggleButton.setAttribute("aria-pressed", isPreview ? "true" : "false");
  compactToggleButton.textContent = isPreview ? "편집 보기" : "미리보기";
}

export function normalizeCompactView(value: string | undefined): CompactView {
  return value === "preview" ? "preview" : "editor";
}

export function nextCompactView(value: string | undefined): CompactView {
  return normalizeCompactView(value) === "preview" ? "editor" : "preview";
}
