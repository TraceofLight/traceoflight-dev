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
