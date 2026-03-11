import { isMediaFileDrag, resolveDropTarget } from "./drag-drop";
import type { WriterDomElements } from "./dom";
import { createUploadBundle, extractFileFromClipboard } from "./upload";
import type { DropTarget } from "./types";

type FeedbackType = "error" | "ok" | "info";

interface WriterMediaBindings {
  windowObject: Window;
  mediaBaseUrl: string;
  elements: Pick<
    WriterDomElements,
    | "editorRoot"
    | "coverDropZone"
    | "coverPreview"
    | "coverUploadInput"
    | "coverInput"
    | "projectVideoUploadTrigger"
    | "projectVideoUploadInput"
    | "projectDetailVideoUrlInput"
  >;
  setDropTargetState: (target: DropTarget) => void;
  clearDropTargetState: () => void;
  showFeedback: (
    message: string,
    type: FeedbackType,
    autoHideMs?: number,
  ) => void;
  insertSnippet: (snippet: string) => Promise<void>;
  queuePreviewRefresh: () => void;
  normalizeCoverInputValue: (withMessage: boolean) => string;
  syncProjectDetailMediaUi: () => void;
}

export function bindWriterMediaInteractions(
  bindings: WriterMediaBindings,
): () => void {
  const {
    windowObject,
    mediaBaseUrl,
    elements,
    setDropTargetState,
    clearDropTargetState,
    showFeedback,
    insertSnippet,
    queuePreviewRefresh,
    normalizeCoverInputValue,
    syncProjectDetailMediaUi,
  } = bindings;
  const {
    editorRoot,
    coverDropZone,
    coverPreview,
    coverUploadInput,
    coverInput,
    projectVideoUploadTrigger,
    projectVideoUploadInput,
    projectDetailVideoUrlInput,
  } = elements;

  let isUploading = false;
  let dragDepth = 0;

  const uploadOneFileToBody = async (file: File) => {
    if (isUploading) {
      showFeedback(
        "이미 업로드를 처리 중입니다. 잠시만 기다려 주세요.",
        "info",
      );
      return;
    }

    isUploading = true;
    showFeedback("미디어 업로드 중...", "info", 0);

    try {
      const bundle = await createUploadBundle(file, mediaBaseUrl);
      await insertSnippet(bundle.snippet);
      showFeedback("업로드 완료, 본문에 삽입했습니다.", "ok");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "미디어 업로드 중 오류가 발생했습니다.";
      showFeedback(message, "error");
    } finally {
      isUploading = false;
    }
  };

  const uploadOneFileToCover = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      showFeedback("커버 이미지는 이미지 파일만 지원합니다.", "error");
      return;
    }

    if (isUploading) {
      showFeedback(
        "이미 업로드를 처리 중입니다. 잠시만 기다려 주세요.",
        "info",
      );
      return;
    }

    isUploading = true;
    showFeedback("커버 이미지 업로드 중...", "info", 0);

    try {
      const bundle = await createUploadBundle(file, mediaBaseUrl);
      coverInput.value = bundle.mediaUrl;
      queuePreviewRefresh();
      showFeedback("커버 이미지 업로드 완료.", "ok");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "커버 이미지 업로드 중 오류가 발생했습니다.";
      showFeedback(message, "error");
    } finally {
      isUploading = false;
    }
  };

  const uploadOneFileToProjectVideo = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      showFeedback("프로젝트 상단 영상은 비디오 파일만 지원합니다.", "error");
      return;
    }

    if (isUploading) {
      showFeedback(
        "이미 업로드를 처리 중입니다. 잠시만 기다려 주세요.",
        "info",
      );
      return;
    }

    isUploading = true;
    showFeedback("프로젝트 영상 업로드 중...", "info", 0);

    try {
      const bundle = await createUploadBundle(file, mediaBaseUrl);
      projectDetailVideoUrlInput.value = bundle.mediaUrl;
      syncProjectDetailMediaUi();
      queuePreviewRefresh();
      showFeedback("프로젝트 영상 업로드 완료.", "ok");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "프로젝트 영상 업로드 중 오류가 발생했습니다.";
      showFeedback(message, "error");
    } finally {
      isUploading = false;
      projectVideoUploadInput.value = "";
    }
  };

  const onEditorDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDropTargetState("body");
  };

  const onEditorDrop = async (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToBody(file);
    } finally {
      clearDropTargetState();
    }
  };

  const onEditorPaste = async (event: Event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (!file) return;
    event.preventDefault();
    await uploadOneFileToBody(file);
  };

  const onCoverDropZoneDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDropTargetState("cover");
  };

  const onCoverDropZoneDrop = async (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      clearDropTargetState();
    }
  };

  const onCoverPreviewClick = () => {
    if (isUploading) return;
    coverUploadInput.click();
  };

  const onCoverPreviewDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetState("cover");
  };

  const onCoverPreviewDrop = async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      clearDropTargetState();
    }
  };

  const onCoverUploadInputChange = async () => {
    const file = coverUploadInput.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      coverUploadInput.value = "";
    }
  };

  const onProjectVideoUploadTriggerClick = () => {
    if (isUploading) return;
    projectVideoUploadInput.click();
  };

  const onProjectVideoUploadInputChange = async () => {
    const file = projectVideoUploadInput.files?.[0];
    if (!file) return;
    await uploadOneFileToProjectVideo(file);
  };

  const onCoverInputPaste = async (event: Event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (file) {
      event.preventDefault();
      await uploadOneFileToCover(file);
      return;
    }

    const pastedText =
      (event as ClipboardEvent).clipboardData?.getData("text/plain")?.trim() ??
      "";
    if (!pastedText) return;

    event.preventDefault();
    coverInput.value = pastedText;
    normalizeCoverInputValue(true);
    queuePreviewRefresh();
  };

  const onWindowDragEnter = (event: DragEvent) => {
    if (!isMediaFileDrag(event)) return;
    event.preventDefault();
    dragDepth += 1;
    setDropTargetState(resolveDropTarget(event));
  };

  const onWindowDragOver = (event: DragEvent) => {
    if (!isMediaFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setDropTargetState(resolveDropTarget(event));
  };

  const onWindowDragLeave = (event: DragEvent) => {
    if (!isMediaFileDrag(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      clearDropTargetState();
    }
  };

  const onWindowDrop = async (event: DragEvent) => {
    if (!isMediaFileDrag(event)) return;
    const alreadyHandled = event.defaultPrevented;
    const dropTarget = resolveDropTarget(event);
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    dragDepth = 0;
    clearDropTargetState();
    if (!file || alreadyHandled) return;
    if (dropTarget === "cover") {
      await uploadOneFileToCover(file);
      return;
    }
    await uploadOneFileToBody(file);
  };

  editorRoot.addEventListener("dragover", onEditorDragOver);
  editorRoot.addEventListener("drop", onEditorDrop);
  editorRoot.addEventListener("paste", onEditorPaste);
  coverDropZone.addEventListener("dragover", onCoverDropZoneDragOver);
  coverDropZone.addEventListener("drop", onCoverDropZoneDrop);
  coverPreview.addEventListener("click", onCoverPreviewClick);
  coverPreview.addEventListener("dragover", onCoverPreviewDragOver);
  coverPreview.addEventListener("drop", onCoverPreviewDrop);
  coverUploadInput.addEventListener("change", onCoverUploadInputChange);
  projectVideoUploadTrigger.addEventListener(
    "click",
    onProjectVideoUploadTriggerClick,
  );
  projectVideoUploadInput.addEventListener(
    "change",
    onProjectVideoUploadInputChange,
  );
  coverInput.addEventListener("paste", onCoverInputPaste);
  windowObject.addEventListener("dragenter", onWindowDragEnter);
  windowObject.addEventListener("dragover", onWindowDragOver);
  windowObject.addEventListener("dragleave", onWindowDragLeave);
  windowObject.addEventListener("drop", onWindowDrop);

  return () => {
    editorRoot.removeEventListener("dragover", onEditorDragOver);
    editorRoot.removeEventListener("drop", onEditorDrop);
    editorRoot.removeEventListener("paste", onEditorPaste);
    coverDropZone.removeEventListener("dragover", onCoverDropZoneDragOver);
    coverDropZone.removeEventListener("drop", onCoverDropZoneDrop);
    coverPreview.removeEventListener("click", onCoverPreviewClick);
    coverPreview.removeEventListener("dragover", onCoverPreviewDragOver);
    coverPreview.removeEventListener("drop", onCoverPreviewDrop);
    coverUploadInput.removeEventListener("change", onCoverUploadInputChange);
    projectVideoUploadTrigger.removeEventListener(
      "click",
      onProjectVideoUploadTriggerClick,
    );
    projectVideoUploadInput.removeEventListener(
      "change",
      onProjectVideoUploadInputChange,
    );
    coverInput.removeEventListener("paste", onCoverInputPaste);
    windowObject.removeEventListener("dragenter", onWindowDragEnter);
    windowObject.removeEventListener("dragover", onWindowDragOver);
    windowObject.removeEventListener("dragleave", onWindowDragLeave);
    windowObject.removeEventListener("drop", onWindowDrop);
    clearDropTargetState();
  };
}
