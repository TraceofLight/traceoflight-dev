import type { WriterDomElements } from "./dom";
import {
  buildDraftQueryPath,
  createDraftListItem,
  normalizeDraftList,
  readDraftSlugFromSearch,
  renderDraftListEmpty,
} from "./drafts";
import { buildTagSuggestionOptions } from "./tags";
import {
  requestDraftBySlug,
  requestDraftList,
  requestPostBySlug,
  requestSeriesList,
  requestTagList,
} from "./posts-api";
import { dedupeTagSlugs } from "./tags";
import type { AdminPostPayload, EditorBridge } from "./types";

type FeedbackType = "error" | "ok" | "info";
type DraftFeedbackType = "info" | "ok" | "error";
type WriterMode = "create" | "edit";

interface WriterLoaderDependencies {
  mode: WriterMode;
  windowObject: Window;
  documentObject: Document;
  dom: Pick<
    WriterDomElements,
    | "titleInput"
    | "slugInput"
    | "excerptInput"
    | "coverInput"
    | "topMediaKindInput"
    | "topMediaImageUrlInput"
    | "topMediaYoutubeUrlInput"
    | "topMediaVideoUrlInput"
    | "contentKindInput"
    | "visibilityInput"
    | "seriesInput"
    | "slugPrefix"
    | "metaPanel"
    | "projectFields"
    | "projectPeriodInput"
    | "projectRoleSummaryInput"
    | "projectIntroInput"
    | "projectHighlightsInput"
    | "projectResourceLinksInput"
    | "tagSuggestionList"
    | "seriesSuggestionList"
    | "draftList"
  >;
  editorBridge: EditorBridge;
  showFeedback: (
    message: string,
    type: FeedbackType,
    autoHideMs?: number,
  ) => void;
  setDraftFeedback: (message: string, state: DraftFeedbackType) => void;
  getEditingPostSlug: () => string | null;
  setEditingPostSlug: (slug: string | null) => void;
  getTagSuggestionSequence: () => number;
  setTagSuggestionSequence: (value: number) => void;
  getSeriesSuggestionSequence: () => number;
  setSeriesSuggestionSequence: (value: number) => void;
  setSelectedTags: (tags: string[]) => void;
  syncTagUi: () => void;
  setSlugValidationState: (state: "idle" | "error", message?: string) => void;
  queueSlugAvailabilityCheck: () => void;
  queuePreviewRefresh: () => void;
  syncTopMediaUi: () => void;
}

export interface WriterLoaders {
  updateDraftQueryParam: (draftSlug: string | null) => void;
  loadTagSuggestions: (query?: string) => Promise<void>;
  loadSeriesSuggestions: (query?: string) => Promise<void>;
  loadDraftBySlug: (
    draftSlug: string,
    options?: { updateQuery?: boolean; showToast?: boolean },
  ) => Promise<boolean>;
  loadDraftFromQuery: () => Promise<void>;
  loadExistingPostBySlug: (
    postSlug: string,
    options?: { showToast?: boolean },
  ) => Promise<boolean>;
  loadDraftList: () => Promise<void>;
}

export function createWriterLoaders(
  dependencies: WriterLoaderDependencies,
): WriterLoaders {
  const {
    mode,
    windowObject,
    documentObject,
    dom,
    editorBridge,
    showFeedback,
    setDraftFeedback,
    getEditingPostSlug,
    setEditingPostSlug,
    getTagSuggestionSequence,
    setTagSuggestionSequence,
    getSeriesSuggestionSequence,
    setSeriesSuggestionSequence,
    setSelectedTags,
    syncTagUi,
    setSlugValidationState,
    queueSlugAvailabilityCheck,
    queuePreviewRefresh,
    syncTopMediaUi,
  } = dependencies;

  const {
    titleInput,
    slugInput,
    excerptInput,
    coverInput,
    topMediaKindInput,
    topMediaImageUrlInput,
    topMediaYoutubeUrlInput,
    topMediaVideoUrlInput,
    contentKindInput,
    visibilityInput,
    seriesInput,
    slugPrefix,
    metaPanel,
    projectFields,
    projectPeriodInput,
    projectRoleSummaryInput,
    projectIntroInput,
    projectHighlightsInput,
    projectResourceLinksInput,
    tagSuggestionList,
    seriesSuggestionList,
    draftList,
  } = dom;

  const syncProjectFieldVisibility = () => {
    const isProject = contentKindInput.value === "project";
    projectFields.hidden = !isProject;
    projectFields.dataset.contentKind = isProject ? "project" : "blog";
    slugPrefix.textContent = isProject ? "/projects/" : "/blog/";
    metaPanel.dataset.contentKind = isProject ? "project" : "blog";
  };

  const updateDraftQueryParam = (draftSlug: string | null) => {
    const nextPath = buildDraftQueryPath(windowObject.location.href, draftSlug);
    windowObject.history.replaceState({}, "", nextPath);
  };

  const applyDraftPayload = async (
    loaded: Partial<AdminPostPayload>,
    fallbackSlug: string,
  ) => {
    const nextSlug = loaded.slug?.trim() || fallbackSlug;
    const resolvedCoverImageUrl =
      loaded.cover_image_url ?? loaded.project_profile?.card_image_url ?? "";
    setEditingPostSlug(nextSlug);
    titleInput.value = loaded.title?.trim() ?? "";
    slugInput.value = loaded.slug?.trim() || fallbackSlug;
    slugInput.dataset.touched = "true";
    excerptInput.value = loaded.excerpt ?? "";
    coverInput.value = resolvedCoverImageUrl;
    topMediaKindInput.value =
      loaded.top_media_kind === "youtube"
        ? "youtube"
        : loaded.top_media_kind === "video"
          ? "video"
          : "image";
    topMediaImageUrlInput.value =
      loaded.top_media_image_url ?? resolvedCoverImageUrl;
    topMediaYoutubeUrlInput.value = loaded.top_media_youtube_url ?? "";
    topMediaVideoUrlInput.value = loaded.top_media_video_url ?? "";
    contentKindInput.value = loaded.content_kind === "project" ? "project" : "blog";
    visibilityInput.value =
      loaded.visibility === "private" ? "private" : "public";
    seriesInput.value =
      loaded.series_title?.trim() ?? loaded.series_context?.series_title ?? "";
    projectPeriodInput.value = loaded.project_profile?.period_label ?? "";
    projectRoleSummaryInput.value = loaded.project_profile?.role_summary ?? "";
    projectIntroInput.value = loaded.project_profile?.project_intro ?? "";
    projectHighlightsInput.value = (
      loaded.project_profile?.highlights_json ??
      loaded.project_profile?.highlights ??
      []
    ).join("\n");
    projectResourceLinksInput.value = (
      loaded.project_profile?.resource_links_json ??
      loaded.project_profile?.resource_links ??
      []
    )
      .map((link) => `${link.label} | ${link.href}`)
      .join("\n");
    syncProjectFieldVisibility();
    syncTopMediaUi();
    setSelectedTags(dedupeTagSlugs(loaded.tags ?? []));
    syncTagUi();
    await editorBridge.setMarkdown(loaded.body_markdown ?? "");
    setSlugValidationState("idle");
    queueSlugAvailabilityCheck();
    queuePreviewRefresh();
  };

  const loadTagSuggestions = async (query = "") => {
    const nextSequence = getTagSuggestionSequence() + 1;
    setTagSuggestionSequence(nextSequence);
    const result = await requestTagList(query);
    if (nextSequence !== getTagSuggestionSequence()) return;
    if (!result.ok) return;
    buildTagSuggestionOptions(tagSuggestionList, result.tags);
  };

  const loadSeriesSuggestions = async (query = "") => {
    const nextSequence = getSeriesSuggestionSequence() + 1;
    setSeriesSuggestionSequence(nextSequence);
    const result = await requestSeriesList();
    if (nextSequence !== getSeriesSuggestionSequence()) return;
    if (!result.ok) return;

    const queryText = query.trim().toLowerCase();
    const filteredSeries = queryText
      ? result.series.filter(
          (series) =>
            series.title.toLowerCase().includes(queryText) ||
            series.slug.includes(queryText),
        )
      : result.series;

    const fragment = documentObject.createDocumentFragment();
    filteredSeries.forEach((series) => {
      const option = documentObject.createElement("option");
      option.value = series.title;
      fragment.append(option);
    });
    seriesSuggestionList.innerHTML = "";
    seriesSuggestionList.append(fragment);
  };

  const loadDraftBySlug = async (
    draftSlug: string,
    options: { updateQuery?: boolean; showToast?: boolean } = {},
  ): Promise<boolean> => {
    const normalizedSlug = draftSlug.trim();
    if (!normalizedSlug) return false;

    const draftResponse = await requestDraftBySlug(normalizedSlug);
    if (!draftResponse.ok) {
      if (draftResponse.reason === "not_found") {
        showFeedback("요청한 임시저장 글을 찾지 못했습니다.", "error");
      } else if (draftResponse.reason === "http_error") {
        showFeedback("임시저장 글을 불러오지 못했습니다.", "error");
      } else {
        showFeedback(
          "네트워크 오류로 임시저장 글을 불러오지 못했습니다.",
          "error",
        );
      }
      return false;
    }

    await applyDraftPayload(draftResponse.payload, normalizedSlug);
    if (options.updateQuery !== false) {
      updateDraftQueryParam(getEditingPostSlug() || normalizedSlug);
    }
    if (options.showToast !== false) {
      showFeedback(
        `임시저장 글을 불러왔습니다: ${titleInput.value || "제목 없음"}`,
        "ok",
      );
    }
    return true;
  };

  const loadDraftFromQuery = async () => {
    if (mode === "edit") return;
    const draftSlug = readDraftSlugFromSearch(windowObject.location.search);
    if (!draftSlug) return;

    await loadDraftBySlug(draftSlug, { updateQuery: true, showToast: true });
  };

  const loadExistingPostBySlug = async (
    postSlug: string,
    options: { showToast?: boolean } = {},
  ): Promise<boolean> => {
    const normalizedSlug = postSlug.trim();
    if (!normalizedSlug) return false;

    const postResponse = await requestPostBySlug(normalizedSlug);
    if (!postResponse.ok) {
      if (postResponse.reason === "not_found") {
        showFeedback("수정할 게시글을 찾지 못했습니다.", "error");
      } else if (postResponse.reason === "http_error") {
        showFeedback("게시글을 불러오지 못했습니다.", "error");
      } else {
        showFeedback("네트워크 오류로 게시글을 불러오지 못했습니다.", "error");
      }
      return false;
    }

    await applyDraftPayload(postResponse.payload, normalizedSlug);
    updateDraftQueryParam(null);
    if (options.showToast !== false) {
      showFeedback(
        `게시글을 불러왔습니다: ${titleInput.value || "제목 없음"}`,
        "ok",
      );
    }
    return true;
  };

  const loadDraftList = async () => {
    setDraftFeedback("임시저장 글을 불러오는 중...", "info");
    renderDraftListEmpty(draftList, "임시저장 글을 불러오는 중입니다.");

    const listResponse = await requestDraftList();
    if (!listResponse.ok) {
      renderDraftListEmpty(draftList, "불러오기 실패");
      if (listResponse.reason === "network_error") {
        setDraftFeedback(
          "네트워크 오류로 임시저장 목록을 불러오지 못했습니다.",
          "error",
        );
      } else {
        setDraftFeedback("임시저장 목록을 불러오지 못했습니다.", "error");
      }
      return;
    }

    const drafts = normalizeDraftList(listResponse.posts);

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
  };

  return {
    updateDraftQueryParam,
    loadTagSuggestions,
    loadSeriesSuggestions,
    loadDraftBySlug,
    loadDraftFromQuery,
    loadExistingPostBySlug,
    loadDraftList,
  };
}
