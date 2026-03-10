import { loadMarkdownRenderer } from "../markdown-renderer-lazy";

import { createEditorBridge } from "./new-post-page/editor-bridge";
import { sanitizeEditorMarkdown } from "./new-post-page/editor-markdown";
import { queryWriterDomElements } from "./new-post-page/dom";
import { bindDraftLayerEvents } from "./new-post-page/draft-layer-events";
import { createWriterLoaders } from "./new-post-page/loaders";
import { bindWriterMediaInteractions } from "./new-post-page/media-controller";
import { setFeedback } from "./new-post-page/feedback";
import { requestDraftDelete } from "./new-post-page/posts-api";
import {
  markCoverPreviewLoaded,
  nextCompactView,
  normalizeCompactView,
  renderCoverPreview,
  renderCoverPreviewEmpty,
  setCompactToggleLabel,
} from "./new-post-page/preview";
import { bindSubmitEvent } from "./new-post-page/submit-events";
import {
  consumeTagInputValue,
  renderMetadataChipRail,
  syncTagInputState,
} from "./new-post-page/tags";
import {
  normalizeCoverUrl,
  normalizeMarkdownLinks,
} from "./new-post-page/link-normalization";
import {
  doesSlugExist,
  slugify,
} from "./new-post-page/slug";
import { normalizeMediaBaseUrl } from "./new-post-page/upload";
import type { CompactView } from "./new-post-page/types";

export interface WriterPageInitOptions {
  mode?: "create" | "edit";
  slug?: string;
}

function resolveWriterMode(rawMode: string | undefined): "create" | "edit" {
  return rawMode === "edit" ? "edit" : "create";
}

function normalizeInitialSlug(rawSlug: string | undefined): string | null {
  const normalized = rawSlug?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export async function initNewPostAdminPage(
  options: WriterPageInitOptions = {},
): Promise<void> {
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
    seriesInput,
    tagInput,
    seriesSuggestionList,
    tagChipList,
    metaChipRail,
    tagSuggestionList,
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
  const mode = resolveWriterMode(options.mode ?? form.dataset.writerMode);
  const initialEditSlug = normalizeInitialSlug(options.slug ?? form.dataset.editSlug);

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

  const syncTagUi = () => {
    syncTagInputState(tagInput, selectedTags);
    renderMetadataChipRail({
      rail: metaChipRail,
      tagChipList,
      tags: selectedTags,
      onRemoveTag: (slug) => {
        selectedTags = selectedTags.filter((current) => current !== slug);
        syncTagUi();
      },
    });
  };

  const commitTagInput = () => {
    const rawValue = tagInput.value.trim();
    if (!rawValue) return;
    const { nextTags, consumed } = consumeTagInputValue(
      `${rawValue},`,
      selectedTags,
    );
    if (!consumed) {
      tagInput.value = "";
      return;
    }
    selectedTags = nextTags;
    tagInput.value = "";
    syncTagUi();
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
  let previewJobQueued = false;
  let markdownPreviewPromise:
    | ReturnType<typeof loadMarkdownRenderer>
    | null = null;
  let slugCheckTimer: number | null = null;
  let slugCheckSequence = 0;
  let tagSuggestionSequence = 0;
  let seriesSuggestionSequence = 0;
  let editingPostSlug: string | null = mode === "edit" ? initialEditSlug : null;
  let activeDropTarget: "body" | "cover" | null = null;
  let selectedTags: string[] = [];

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
  syncTagUi();

  const setDropTargetState = (target: "body" | "cover" | null) => {
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
      markdownPreviewPromise ??= loadMarkdownRenderer();
      const markdownPreview = await markdownPreviewPromise;
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

  const loaders = createWriterLoaders({
    mode,
    windowObject: window,
    documentObject: document,
    dom: {
      titleInput,
      slugInput,
      excerptInput,
      coverInput,
      visibilityInput,
      seriesInput,
      tagSuggestionList,
      seriesSuggestionList,
      draftList,
    },
    editorBridge,
    showFeedback,
    setDraftFeedback,
    getEditingPostSlug: () => editingPostSlug,
    setEditingPostSlug: (nextSlug) => {
      editingPostSlug = nextSlug;
    },
    getTagSuggestionSequence: () => tagSuggestionSequence,
    setTagSuggestionSequence: (value) => {
      tagSuggestionSequence = value;
    },
    getSeriesSuggestionSequence: () => seriesSuggestionSequence,
    setSeriesSuggestionSequence: (value) => {
      seriesSuggestionSequence = value;
    },
    getSelectedTags: () => selectedTags,
    setSelectedTags: (tags) => {
      selectedTags = tags;
    },
    syncTagUi,
    setSlugValidationState,
    queueSlugAvailabilityCheck,
    queuePreviewRefresh,
  });
  const {
    updateDraftQueryParam,
    loadTagSuggestions,
    loadSeriesSuggestions,
    loadDraftBySlug,
    loadDraftFromQuery,
    loadExistingPostBySlug,
    loadDraftList,
  } = loaders;

  const insertSnippet = async (snippet: string) => {
    const currentMarkdown = await editorBridge.getMarkdown();
    await editorBridge.setMarkdown(
      `${currentMarkdown.trimEnd()}\n\n${snippet}\n`,
    );
    queuePreviewRefresh();
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
  visibilityInput.addEventListener("change", () => {
    queuePreviewRefresh();
  });

  tagInput.addEventListener("input", () => {
    const query = tagInput.value.trim();
    void loadTagSuggestions(query);
  });

  seriesInput.addEventListener("focus", () => {
    const query = seriesInput.value.trim();
    void loadSeriesSuggestions(query);
  });

  seriesInput.addEventListener("input", () => {
    const query = seriesInput.value.trim();
    void loadSeriesSuggestions(query);
  });

  tagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTagInput();
      return;
    }

    if (
      event.key === "Backspace" &&
      !tagInput.value.trim() &&
      selectedTags.length > 0
    ) {
      selectedTags = selectedTags.slice(0, -1);
      syncTagUi();
    }
  });

  tagInput.addEventListener("blur", () => {
    commitTagInput();
  });

  coverInput.addEventListener("input", queuePreviewRefresh);
  coverInput.addEventListener("blur", () => {
    normalizeCoverInputValue(true);
    queuePreviewRefresh();
  });

  const unobserveEditor = editorBridge.observeChanges(queuePreviewRefresh);
  setDraftLayerOpen(false);
  setPublishLayerOpen(false);

  bindDraftLayerEvents({
    openDraftsButton,
    closeDraftsButton,
    draftBackdrop,
    draftList,
    setPublishLayerOpen,
    setDraftLayerOpen,
    loadDraftList,
    loadDraftBySlug,
    requestDraftDeleteBySlug: async (slug) => {
      const deleteResult = await requestDraftDelete(slug);
      if (!deleteResult.ok) return deleteResult.reason;
      return "ok";
    },
    setDraftFeedback,
    getEditingPostSlug: () => editingPostSlug,
    setEditingPostSlug: (nextSlug) => {
      editingPostSlug = nextSlug;
    },
    updateDraftQueryParam,
  });

  const teardownMediaBindings = bindWriterMediaInteractions({
    windowObject: window,
    mediaBaseUrl,
    elements: {
      editorRoot,
      coverDropZone,
      coverPreview,
      coverUploadInput,
      uploadTrigger,
      uploadInput,
      coverInput,
    },
    setDropTargetState,
    clearDropTargetState,
    showFeedback,
    insertSnippet,
    queuePreviewRefresh,
    normalizeCoverInputValue,
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

  window.addEventListener("resize", syncCompactViewForViewport);

  bindSubmitEvent({
    form,
    slugInput,
    titleInput,
    excerptInput,
    coverInput,
    visibilityInput,
    seriesInput,
    openPublishButton,
    confirmPublishButton,
    editorBridge,
    isPublishLayerOpen,
    setPublishLayerOpen,
    ensureTitleExists,
    validateSlugAvailability,
    normalizeCoverInputValue,
    showFeedback,
    setSlugValidationState,
    queuePreviewRefresh,
    updateDraftQueryParam,
    getEditingPostSlug: () => editingPostSlug,
    setEditingPostSlug: (nextSlug) => {
      editingPostSlug = nextSlug;
    },
    getSelectedTags: () => selectedTags,
  });

  const teardown = () => {
    unobserveEditor();
    teardownMediaBindings();
    if (slugCheckTimer !== null) {
      window.clearTimeout(slugCheckTimer);
      slugCheckTimer = null;
    }
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("resize", syncCompactViewForViewport);
    setDraftLayerOpen(false);
    setPublishLayerOpen(false);
    clearDropTargetState();
  };

  window.addEventListener("beforeunload", teardown, { once: true });
  window.addEventListener("pagehide", teardown, { once: true });

  void loadTagSuggestions();
  void loadSeriesSuggestions();
  if (mode === "edit") {
    if (initialEditSlug) {
      await loadExistingPostBySlug(initialEditSlug, { showToast: false });
    } else {
      showFeedback("수정할 게시글 주소를 찾지 못했습니다.", "error");
    }
  } else {
    await loadDraftFromQuery();
  }
  syncCompactViewForViewport();
  await refreshPreview();
}
