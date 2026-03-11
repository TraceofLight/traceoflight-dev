import type { CompactView } from "./types";

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
  previewMetaSummary: HTMLElement;
  previewMetaSeries: HTMLElement;
  previewMetaTags: HTMLElement;
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
    <p class="writer-preview-meta-value${trimmed ? "" : " is-empty"}">${trimmed || emptyMessage}</p>
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
  excerpt: string;
  seriesTitle: string;
  tags: string[];
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
    previewMetaSummary,
    previewMetaSeries,
    previewMetaTags,
    previewMetaProject,
    previewMetaHighlights,
    previewMetaLinks,
  } = elements;
  const {
    contentKind,
    visibility,
    excerpt,
    seriesTitle,
    tags,
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
  renderMetaBlock(previewMetaSummary, "요약", excerpt, "요약 입력 전입니다.");
  renderMetaBlock(previewMetaSeries, "시리즈", seriesTitle, "시리즈 없음");
  renderMetaBlock(
    previewMetaTags,
    "태그",
    tags.map((item) => `#${item}`).join(", "),
    "태그 입력 전입니다.",
  );

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
