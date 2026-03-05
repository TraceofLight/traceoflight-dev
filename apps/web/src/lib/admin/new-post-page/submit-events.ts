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
import type { EditorBridge, PostStatus, PostVisibility } from "./types";

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
  visibilityInput: HTMLSelectElement;
  seriesInput: HTMLInputElement;
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
      tags: getSelectedTags(),
      seriesTitle: seriesName,
      nowIso: new Date().toISOString(),
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
}
