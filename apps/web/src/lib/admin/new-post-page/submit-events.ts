import { sanitizeEditorMarkdown } from "./editor-markdown";
import {
  isSlugAlreadyExistsError,
  normalizeJsonError,
} from "./feedback";
import { normalizeMarkdownLinks } from "./link-normalization";
import { requestPostSubmit } from "./posts-api";
import { suggestAvailableSlug } from "./slug";
import {
  buildSubmitPayload,
  resolveSubmitRequest,
  resolveSubmitStatus,
} from "./submit";
import type {
  EditorBridge,
  PostContentKind,
  PostStatus,
  PostVisibility,
  ProjectDetailMediaKind,
} from "./types";

type FeedbackState = "info" | "ok" | "error";
type ShowFeedback = (
  message: string,
  type: FeedbackState,
  autoHideMs?: number,
) => void;

export interface SubmitBindings {
  form: HTMLFormElement;
  slugInput: HTMLInputElement;
  titleInput: HTMLInputElement;
  excerptInput: HTMLTextAreaElement;
  coverInput: HTMLInputElement;
  contentKindInput: HTMLSelectElement;
  visibilityInput: HTMLSelectElement;
  seriesInput: HTMLInputElement;
  projectPeriodInput: HTMLInputElement;
  projectRoleSummaryInput: HTMLInputElement;
  projectIntroInput: HTMLTextAreaElement;
  projectDetailMediaKindInput: HTMLSelectElement;
  projectYoutubeUrlInput: HTMLInputElement;
  projectDetailVideoUrlInput: HTMLInputElement;
  projectHighlightsInput: HTMLTextAreaElement;
  projectResourceLinksInput: HTMLTextAreaElement;
  openPublishButton: HTMLButtonElement;
  confirmPublishButton: HTMLButtonElement;
  editorBridge: EditorBridge;
  isPublishLayerOpen: () => boolean;
  setPublishLayerOpen: (nextOpen: boolean) => void;
  ensureTitleExists: (message: string) => boolean;
  validateSlugAvailability: (source: "typing" | "submit") => Promise<boolean>;
  normalizeCoverInputValue: (withMessage: boolean) => string;
  showFeedback: ShowFeedback;
  setSlugValidationState: (state: "idle" | "error", message?: string) => void;
  queuePreviewRefresh: () => void;
  updateDraftQueryParam: (nextSlug: string | null) => void;
  getEditingPostSlug: () => string | null;
  setEditingPostSlug: (nextSlug: string | null) => void;
  getSelectedTags: () => string[];
}

export function bindSubmitEvent(bindings: SubmitBindings): void {
  const {
    form,
    slugInput,
    titleInput,
    excerptInput,
    coverInput,
    contentKindInput,
    visibilityInput,
    seriesInput,
    projectPeriodInput,
    projectRoleSummaryInput,
    projectIntroInput,
    projectDetailMediaKindInput,
    projectYoutubeUrlInput,
    projectDetailVideoUrlInput,
    projectHighlightsInput,
    projectResourceLinksInput,
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
    getEditingPostSlug,
    setEditingPostSlug,
    getSelectedTags,
  } = bindings;

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
    const seriesName = seriesInput.value.trim();
    const contentKind: PostContentKind =
      contentKindInput.value === "project" ? "project" : "blog";
    const visibility: PostVisibility =
      visibilityInput.value === "private" ? "private" : "public";
    const projectPeriod = projectPeriodInput.value.trim();
    const projectRole = projectRoleSummaryInput.value.trim();
    const projectDetailMediaKind: ProjectDetailMediaKind =
      projectDetailMediaKindInput.value === "youtube"
        ? "youtube"
        : projectDetailMediaKindInput.value === "video"
          ? "video"
          : "image";
    const bodyMarkdown = normalizeMarkdownLinks(
      sanitizeEditorMarkdown((await editorBridge.getMarkdown()).trim()),
      window.location.protocol,
    );
    normalizeCoverInputValue(false);

    if (!ensureTitleExists("제목을 입력해 주세요.")) {
      return;
    }

    if (contentKind === "project") {
      if (!projectPeriod) {
        showFeedback("프로젝트 작업 기간을 입력해 주세요.", "error");
        projectPeriodInput.focus();
        return;
      }
      if (!projectRole) {
        showFeedback("프로젝트 역할 요약을 입력해 주세요.", "error");
        projectRoleSummaryInput.focus();
        return;
      }
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
      contentKind,
      status,
      visibility,
      tags: getSelectedTags(),
      seriesTitle: seriesName,
      nowIso: new Date().toISOString(),
      projectPeriod: projectPeriod,
      projectRoleSummary: projectRole,
      projectIntro: projectIntroInput.value,
      projectDetailMediaKind: projectDetailMediaKind,
      projectYoutubeUrl: projectYoutubeUrlInput.value,
      projectDetailVideoUrl: projectDetailVideoUrlInput.value,
      projectHighlights: projectHighlightsInput.value,
      projectResourceLinks: projectResourceLinksInput.value,
    });
    const submitRequest = resolveSubmitRequest(getEditingPostSlug());

    showFeedback("게시글 저장 중...", "info", 0);
    openPublishButton.disabled = true;
    confirmPublishButton.disabled = true;

    try {
      const submitResult = await requestPostSubmit(submitRequest, payload);
      if (!submitResult.ok) {
        if (
          submitResult.status === 409 &&
          isSlugAlreadyExistsError(submitResult.errorPayload)
        ) {
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
        throw new Error(normalizeJsonError(submitResult.errorPayload));
      }

      const created = submitResult.created;
      if (created.slug) {
        slugInput.value = created.slug;
        setEditingPostSlug(created.slug);
        setSlugValidationState("idle");
        queuePreviewRefresh();
      }
      const createdStatus = (created.status ?? status).toLowerCase();
      const publicPath =
        createdStatus === "published"
          ? contentKind === "project"
            ? `/projects/${created.slug}`
            : `/blog/${created.slug}/`
          : contentKind === "project"
            ? "/projects/"
            : "/blog/";
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
}
