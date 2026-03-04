import { createMarkdownRenderer } from "../markdown-renderer";

import { createEditorBridge } from "./new-post-page/editor-bridge";
import { sanitizeEditorMarkdown } from "./new-post-page/editor-markdown";
import { queryWriterDomElements } from "./new-post-page/dom";
import {
  buildDraftQueryPath,
  createDraftListItem,
  normalizeDraftList,
  readDraftSlugFromSearch,
  renderDraftListEmpty,
} from "./new-post-page/drafts";
import { isMediaFileDrag, resolveDropTarget } from "./new-post-page/drag-drop";
import {
  isSlugAlreadyExistsError,
  normalizeJsonError,
  setFeedback,
} from "./new-post-page/feedback";
import {
  markCoverPreviewLoaded,
  nextCompactView,
  normalizeCompactView,
  renderCoverPreview,
  renderCoverPreviewEmpty,
  setCompactToggleLabel,
} from "./new-post-page/preview";
import {
  buildSubmitPayload,
  resolveSubmitRequest,
  resolveSubmitStatus,
} from "./new-post-page/submit";
import {
  normalizeCoverUrl,
  normalizeMarkdownLinks,
} from "./new-post-page/link-normalization";
import {
  doesSlugExist,
  slugify,
  suggestAvailableSlug,
} from "./new-post-page/slug";
import {
  createUploadBundle,
  extractFileFromClipboard,
  normalizeMediaBaseUrl,
} from "./new-post-page/upload";
import type {
  AdminPostPayload,
  CompactView,
  DropTarget,
  PostStatus,
  PostVisibility,
} from "./new-post-page/types";

const markdownPreview = createMarkdownRenderer();
export async function initNewPostAdminPage(): Promise<void> {
  const dom = queryWriterDomElements();
  if (!dom) return;

  const {
    form,
    writerShell,
    feedback,
    editorRoot,
    titleInput,
    slugInput,
    slugFeedback,
    excerptInput,
    coverInput,
    visibilityInput,
    previewTitle,
    previewContent,
    coverPreview,
    coverPreviewImage,
    coverPreviewEmpty,
    coverUploadInput,
    compactToggleButton,
    uploadTrigger,
    uploadInput,
    openDraftsButton,
    draftLayer,
    draftBackdrop,
    closeDraftsButton,
    draftList,
    draftFeedback,
    openPublishButton,
    publishLayer,
    publishBackdrop,
    closePublishButton,
    confirmPublishButton,
    editorDropZone,
    coverDropZone,
  } = dom;

  const toastTimer = { id: null as number | null };
  const showFeedback = (
    message: string,
    type: "error" | "ok" | "info",
    autoHideMs?: number,
  ) => {
    setFeedback(feedback, message, type, {
      autoHideMs,
      hideTimerRef: toastTimer,
    });
  };
  const setDraftFeedback = (
    message: string,
    state: "info" | "ok" | "error",
  ) => {
    draftFeedback.textContent = message;
    draftFeedback.dataset.state = state;
  };

  const mediaBaseUrl = normalizeMediaBaseUrl(
    form.dataset.mediaBaseUrl ?? "",
    window.location.origin,
  );
  const editorBridge = await createEditorBridge(editorRoot, "");
  if (editorBridge.mode === "fallback") {
    showFeedback(
      `Editor initialization failed, switched to fallback textarea: ${editorBridge.initError ?? "unknown"}`,
      "error",
      0,
    );
  }

  let isUploading = false;
  let previewJobQueued = false;
  let dragDepth = 0;
  let slugCheckTimer: number | null = null;
  let slugCheckSequence = 0;
  let editingPostSlug: string | null = null;
  let activeDropTarget: DropTarget = null;

  const setDraftLayerOpen = (nextOpen: boolean) => {
    draftLayer.hidden = !nextOpen;
    draftLayer.setAttribute("data-open", nextOpen ? "true" : "false");
  };

  const isDraftLayerOpen = () =>
    draftLayer.getAttribute("data-open") === "true";

  const setSlugValidationState = (state: "idle" | "error", message = "") => {
    slugFeedback.dataset.state = state;
    slugFeedback.textContent = state === "error" ? message : "";
    slugInput.setAttribute(
      "aria-invalid",
      state === "error" ? "true" : "false",
    );
  };

  const validateSlugAvailability = async (
    source: "typing" | "submit",
  ): Promise<boolean> => {
    const slug = slugInput.value.trim();
    if (!slug) {
      setSlugValidationState("idle");
      return false;
    }

    if (editingPostSlug && slug === editingPostSlug) {
      setSlugValidationState("idle");
      return false;
    }

    const checkId = ++slugCheckSequence;
    let exists = false;
    try {
      exists = await doesSlugExist(slug);
    } catch {
      if (source === "submit") {
        showFeedback(
          "slug 중복 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          "error",
        );
      }
      return false;
    }

    if (checkId !== slugCheckSequence) return false;

    if (exists) {
      setSlugValidationState(
        "error",
        "이미 사용 중인 주소입니다. 다른 Post URL을 입력해 주세요.",
      );
      return true;
    }

    setSlugValidationState("idle");
    return false;
  };

  const queueSlugAvailabilityCheck = () => {
    if (slugCheckTimer !== null) {
      window.clearTimeout(slugCheckTimer);
      slugCheckTimer = null;
    }

    if (!slugInput.value.trim()) {
      setSlugValidationState("idle");
      return;
    }

    slugCheckTimer = window.setTimeout(() => {
      slugCheckTimer = null;
      void validateSlugAvailability("typing");
    }, 1000);
  };
  setSlugValidationState("idle");

  const setDropTargetState = (target: DropTarget) => {
    if (activeDropTarget === target) return;
    activeDropTarget = target;
    editorDropZone.setAttribute(
      "data-drop-state",
      target === "body" ? "active" : "idle",
    );
    coverDropZone.setAttribute(
      "data-drop-state",
      target === "cover" ? "active" : "idle",
    );
    coverPreview.setAttribute(
      "data-drop-state",
      target === "cover" ? "active" : "idle",
    );
  };

  const clearDropTargetState = () => {
    setDropTargetState(null);
  };

  const setPublishLayerOpen = (nextOpen: boolean) => {
    publishLayer.hidden = !nextOpen;
    publishLayer.setAttribute("data-open", nextOpen ? "true" : "false");
    confirmPublishButton.disabled = false;
  };

  const isPublishLayerOpen = () =>
    publishLayer.getAttribute("data-open") === "true";

  const normalizeCoverInputValue = (withMessage: boolean) => {
    const normalized = normalizeCoverUrl(
      coverInput.value,
      window.location.protocol,
    );
    const changed = normalized.value !== coverInput.value.trim();
    if (changed) {
      coverInput.value = normalized.value;
    }
    if (withMessage && normalized.message) {
      showFeedback(normalized.message, "info");
    }
    return normalized.value;
  };

  const ensureTitleExists = (message: string): boolean => {
    if (titleInput.value.trim().length > 0) return true;
    showFeedback(message, "error");
    titleInput.focus();
    return false;
  };

  coverPreviewImage.addEventListener("error", () => {
    renderCoverPreviewEmpty(
      { coverPreview, coverPreviewImage, coverPreviewEmpty },
      "이미지를 불러오지 못했습니다. URL을 확인하세요.",
    );
  });

  coverPreviewImage.addEventListener("load", () => {
    markCoverPreviewLoaded({ coverPreview, coverPreviewImage, coverPreviewEmpty });
  });

  const refreshPreview = async () => {
    const markdown = sanitizeEditorMarkdown(await editorBridge.getMarkdown());
    const normalizedMarkdown = normalizeMarkdownLinks(
      markdown,
      window.location.protocol,
    );
    const hasBodyContent = normalizedMarkdown.trim().length > 0;
    editorDropZone.setAttribute(
      "data-has-content",
      hasBodyContent ? "true" : "false",
    );
    if (hasBodyContent) {
      previewContent.innerHTML = markdownPreview.render(normalizedMarkdown);
    } else {
      previewContent.innerHTML =
        '<p class="writer-preview-empty">본문을 입력하면 여기에 미리보기가 표시됩니다.</p>';
    }

    const nextTitle = titleInput.value.trim();
    previewTitle.textContent = nextTitle;
    renderCoverPreview(
      { coverPreview, coverPreviewImage, coverPreviewEmpty },
      coverInput.value.trim(),
    );
  };

  const queuePreviewRefresh = () => {
    if (previewJobQueued) return;
    previewJobQueued = true;
    window.requestAnimationFrame(async () => {
      previewJobQueued = false;
      await refreshPreview();
    });
  };

  const compactMediaQuery = window.matchMedia("(max-width: 1200px)");

  const setCompactView = (view: CompactView) => {
    writerShell.dataset.compactView = view;
    setCompactToggleLabel(compactToggleButton, view);
    if (view === "preview") {
      queuePreviewRefresh();
    }
  };

  const syncCompactViewForViewport = () => {
    if (!compactMediaQuery.matches) {
      writerShell.dataset.compactView = "editor";
      setCompactToggleLabel(compactToggleButton, "editor");
      return;
    }

    const currentView = normalizeCompactView(writerShell.dataset.compactView);
    setCompactToggleLabel(compactToggleButton, currentView);
  };

  const updateDraftQueryParam = (draftSlug: string | null) => {
    const nextPath = buildDraftQueryPath(window.location.href, draftSlug);
    window.history.replaceState({}, "", nextPath);
  };

  const applyDraftPayload = async (
    loaded: Partial<AdminPostPayload>,
    fallbackSlug: string,
  ) => {
    editingPostSlug = loaded.slug?.trim() || fallbackSlug;
    titleInput.value = loaded.title?.trim() ?? "";
    slugInput.value = loaded.slug?.trim() || fallbackSlug;
    slugInput.dataset.touched = "true";
    excerptInput.value = loaded.excerpt ?? "";
    coverInput.value = loaded.cover_image_url ?? "";
    visibilityInput.value =
      loaded.visibility === "private" ? "private" : "public";
    await editorBridge.setMarkdown(loaded.body_markdown ?? "");
    setSlugValidationState("idle");
    queueSlugAvailabilityCheck();
    queuePreviewRefresh();
  };

  const loadDraftBySlug = async (
    draftSlug: string,
    options: { updateQuery?: boolean; showToast?: boolean } = {},
  ): Promise<boolean> => {
    const normalizedSlug = draftSlug.trim();
    if (!normalizedSlug) return false;

    try {
      const response = await fetch(
        `/internal-api/posts/${encodeURIComponent(normalizedSlug)}?status=draft`,
      );
      if (response.status === 404) {
        showFeedback("요청한 임시저장 글을 찾지 못했습니다.", "error");
        return false;
      }
      if (!response.ok) {
        showFeedback("임시저장 글을 불러오지 못했습니다.", "error");
        return false;
      }

      const loaded = (await response.json()) as Partial<AdminPostPayload>;
      await applyDraftPayload(loaded, normalizedSlug);
      if (options.updateQuery !== false) {
        updateDraftQueryParam(editingPostSlug || normalizedSlug);
      }
      if (options.showToast !== false) {
        showFeedback(
          `임시저장 글을 불러왔습니다: ${titleInput.value || "제목 없음"}`,
          "ok",
        );
      }
      return true;
    } catch {
      showFeedback(
        "네트워크 오류로 임시저장 글을 불러오지 못했습니다.",
        "error",
      );
      return false;
    }
  };

  const loadDraftFromQuery = async () => {
    const draftSlug = readDraftSlugFromSearch(window.location.search);
    if (!draftSlug) return;

    await loadDraftBySlug(draftSlug, { updateQuery: true, showToast: true });
  };

  const loadDraftList = async () => {
    setDraftFeedback("임시저장 글을 불러오는 중...", "info");
    renderDraftListEmpty(draftList, "임시저장 글을 불러오는 중입니다.");

    try {
      const response = await fetch(
        "/internal-api/posts?status=draft&limit=100&offset=0",
      );
      if (!response.ok) {
        renderDraftListEmpty(draftList, "불러오기 실패");
        setDraftFeedback("임시저장 목록을 불러오지 못했습니다.", "error");
        return;
      }

      const posts = (await response.json()) as unknown;
      const drafts = normalizeDraftList(posts);

      draftList.innerHTML = "";
      if (drafts.length === 0) {
        renderDraftListEmpty(draftList, "임시저장 글이 없습니다.");
        setDraftFeedback("", "info");
        return;
      }

      drafts.forEach((post) => {
        draftList.append(createDraftListItem(post));
      });
      setDraftFeedback("", "info");
    } catch {
      renderDraftListEmpty(draftList, "불러오기 실패");
      setDraftFeedback(
        "네트워크 오류로 임시저장 목록을 불러오지 못했습니다.",
        "error",
      );
    }
  };

  const insertSnippet = async (snippet: string) => {
    const currentMarkdown = await editorBridge.getMarkdown();
    await editorBridge.setMarkdown(
      `${currentMarkdown.trimEnd()}\n\n${snippet}\n`,
    );
    queuePreviewRefresh();
  };

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
    uploadTrigger.disabled = true;

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
      uploadTrigger.disabled = false;
      uploadInput.value = "";
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

  titleInput.addEventListener("input", () => {
    if (!slugInput.dataset.touched || slugInput.value.trim().length === 0) {
      slugInput.value = slugify(titleInput.value);
      queueSlugAvailabilityCheck();
    }
    queuePreviewRefresh();
  });

  slugInput.addEventListener("input", () => {
    slugInput.dataset.touched = "true";
    queueSlugAvailabilityCheck();
    queuePreviewRefresh();
  });

  excerptInput.addEventListener("input", queuePreviewRefresh);
  coverInput.addEventListener("input", queuePreviewRefresh);
  coverInput.addEventListener("blur", () => {
    normalizeCoverInputValue(true);
    queuePreviewRefresh();
  });

  const unobserveEditor = editorBridge.observeChanges(queuePreviewRefresh);
  setDraftLayerOpen(false);
  setPublishLayerOpen(false);

  openDraftsButton.addEventListener("click", async () => {
    setPublishLayerOpen(false);
    setDraftLayerOpen(true);
    await loadDraftList();
  });

  closeDraftsButton.addEventListener("click", () => {
    setDraftLayerOpen(false);
  });

  draftBackdrop.addEventListener("click", () => {
    setDraftLayerOpen(false);
  });

  draftList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("writer-draft-title")) {
      const slug = target.dataset.slug?.trim();
      if (!slug) return;
      const loaded = await loadDraftBySlug(slug, {
        updateQuery: true,
        showToast: true,
      });
      if (loaded) {
        setDraftLayerOpen(false);
      }
      return;
    }

    if (
      target.classList.contains("writer-draft-delete") &&
      target instanceof HTMLButtonElement
    ) {
      const slug = target.dataset.slug?.trim();
      if (!slug) return;

      target.disabled = true;
      try {
        const response = await fetch(
          `/internal-api/posts/${encodeURIComponent(slug)}?status=draft`,
          {
            method: "DELETE",
          },
        );
        if (!response.ok) {
          setDraftFeedback("임시저장 글 삭제에 실패했습니다.", "error");
          target.disabled = false;
          return;
        }

        if (editingPostSlug === slug) {
          editingPostSlug = null;
          updateDraftQueryParam(null);
        }
        setDraftFeedback("임시저장 글을 삭제했습니다.", "ok");
        await loadDraftList();
      } catch {
        setDraftFeedback("네트워크 오류로 삭제하지 못했습니다.", "error");
        target.disabled = false;
      }
    }
  });

  uploadTrigger.addEventListener("click", () => {
    uploadInput.click();
  });

  compactToggleButton.addEventListener("click", () => {
    if (!compactMediaQuery.matches) {
      queuePreviewRefresh();
      return;
    }

    const nextView: CompactView = nextCompactView(writerShell.dataset.compactView);
    setCompactView(nextView);
  });

  openPublishButton.addEventListener("click", () => {
    if (!ensureTitleExists("제목을 입력한 뒤 출간 설정을 열어 주세요.")) {
      return;
    }
    setDraftLayerOpen(false);
    setPublishLayerOpen(true);
    queueSlugAvailabilityCheck();
  });

  closePublishButton.addEventListener("click", () => {
    setPublishLayerOpen(false);
  });

  publishBackdrop.addEventListener("click", () => {
    setPublishLayerOpen(false);
  });

  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (isDraftLayerOpen()) {
      event.preventDefault();
      setDraftLayerOpen(false);
      return;
    }
    if (!isPublishLayerOpen()) return;
    event.preventDefault();
    setPublishLayerOpen(false);
  };

  window.addEventListener("keydown", onWindowKeyDown);

  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    await uploadOneFileToBody(file);
  });

  editorRoot.addEventListener("dragover", (event) => {
    event.preventDefault();
    setDropTargetState("body");
  });

  editorRoot.addEventListener("drop", async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToBody(file);
    } finally {
      clearDropTargetState();
    }
  });

  editorRoot.addEventListener("paste", async (event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (!file) return;
    event.preventDefault();
    await uploadOneFileToBody(file);
  });

  coverDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    setDropTargetState("cover");
  });

  coverDropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      clearDropTargetState();
    }
  });

  coverPreview.addEventListener("click", () => {
    if (isUploading) return;
    coverUploadInput.click();
  });

  coverPreview.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetState("cover");
  });

  coverPreview.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      clearDropTargetState();
    }
  });

  coverUploadInput.addEventListener("change", async () => {
    const file = coverUploadInput.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      coverUploadInput.value = "";
    }
  });

  coverInput.addEventListener("paste", async (event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (file) {
      event.preventDefault();
      await uploadOneFileToCover(file);
      return;
    }

    const pastedText = event.clipboardData?.getData("text/plain")?.trim() ?? "";
    if (!pastedText) return;

    event.preventDefault();
    coverInput.value = pastedText;
    normalizeCoverInputValue(true);
    queuePreviewRefresh();
  });

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

  window.addEventListener("dragenter", onWindowDragEnter);
  window.addEventListener("dragover", onWindowDragOver);
  window.addEventListener("dragleave", onWindowDragLeave);
  window.addEventListener("drop", onWindowDrop);
  window.addEventListener("resize", syncCompactViewForViewport);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    const desiredStatus = submitter?.getAttribute("data-submit-status");
    const status: PostStatus = resolveSubmitStatus({
      desiredStatus: desiredStatus ?? null,
      submitterIsNull: submitter === null,
      publishLayerOpen: isPublishLayerOpen(),
    });
    if (desiredStatus === "draft") {
      setPublishLayerOpen(false);
    }

    const slug = slugInput.value.trim();
    const title = titleInput.value.trim();
    const visibility: PostVisibility =
      visibilityInput.value === "private" ? "private" : "public";
    const bodyMarkdown = normalizeMarkdownLinks(
      sanitizeEditorMarkdown((await editorBridge.getMarkdown()).trim()),
      window.location.protocol,
    );
    normalizeCoverInputValue(false);

    if (!ensureTitleExists("제목을 입력해 주세요.")) {
      return;
    }

    if (!slug) {
      showFeedback("Post URL을 입력해 주세요.", "error");
      slugInput.focus();
      if (desiredStatus === "published" && !isPublishLayerOpen()) {
        setPublishLayerOpen(true);
      }
      return;
    }

    const hasDuplicateSlug = await validateSlugAvailability("submit");
    if (hasDuplicateSlug) {
      if (desiredStatus === "published" && !isPublishLayerOpen()) {
        setPublishLayerOpen(true);
      }
      slugInput.focus();
      return;
    }

    const payload = buildSubmitPayload({
      slug,
      title,
      excerpt: excerptInput.value,
      bodyMarkdown,
      coverImageUrl: coverInput.value,
      status,
      visibility,
      nowIso: new Date().toISOString(),
    });
    const submitRequest = resolveSubmitRequest(editingPostSlug);

    showFeedback("게시글 저장 중...", "info", 0);
    openPublishButton.disabled = true;
    confirmPublishButton.disabled = true;

    try {
      const response = await fetch(submitRequest.path, {
        method: submitRequest.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = (await response
          .json()
          .catch(() => null)) as unknown;
        if (response.status === 409 && isSlugAlreadyExistsError(errorPayload)) {
          let suggestedSlug: string | null = null;
          try {
            suggestedSlug = await suggestAvailableSlug(slug);
          } catch {
            suggestedSlug = null;
          }

          if (desiredStatus === "published" && !isPublishLayerOpen()) {
            setPublishLayerOpen(true);
          }

          if (suggestedSlug && suggestedSlug !== slug) {
            setSlugValidationState(
              "error",
              `이미 사용 중인 주소입니다. 예: ${suggestedSlug}`,
            );
          } else {
            setSlugValidationState(
              "error",
              "이미 사용 중인 주소입니다. 다른 Post URL을 입력해 주세요.",
            );
          }

          slugInput.focus();
          return;
        }
        throw new Error(normalizeJsonError(errorPayload));
      }

      const created = (await response.json()) as {
        slug: string;
        status: string;
      };
      if (created.slug) {
        slugInput.value = created.slug;
        editingPostSlug = created.slug;
        setSlugValidationState("idle");
        queuePreviewRefresh();
      }
      const createdStatus = (created.status ?? status).toLowerCase();
      const publicPath =
        createdStatus === "published" ? `/blog/${created.slug}/` : "/blog/";
      if (createdStatus === "published") {
        setPublishLayerOpen(false);
        updateDraftQueryParam(null);
        window.location.assign(publicPath);
        return;
      }
      updateDraftQueryParam(created.slug);
      showFeedback("임시저장 완료", "ok");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.";
      showFeedback(message, "error");
    } finally {
      openPublishButton.disabled = false;
      confirmPublishButton.disabled = false;
    }
  });

  const teardown = () => {
    unobserveEditor();
    if (slugCheckTimer !== null) {
      window.clearTimeout(slugCheckTimer);
      slugCheckTimer = null;
    }
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("dragenter", onWindowDragEnter);
    window.removeEventListener("dragover", onWindowDragOver);
    window.removeEventListener("dragleave", onWindowDragLeave);
    window.removeEventListener("drop", onWindowDrop);
    window.removeEventListener("resize", syncCompactViewForViewport);
    setDraftLayerOpen(false);
    setPublishLayerOpen(false);
    clearDropTargetState();
  };

  window.addEventListener("beforeunload", teardown, { once: true });
  window.addEventListener("pagehide", teardown, { once: true });

  await loadDraftFromQuery();
  syncCompactViewForViewport();
  await refreshPreview();
}
