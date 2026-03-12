import { sanitizeEditorMarkdown } from "./editor-markdown";
import {
  isSlugAlreadyExistsError,
  normalizeJsonError,
} from "./feedback";
import { normalizeMarkdownLinks } from "./link-normalization";
import { requestAdminLogin, requestPostSubmit } from "./posts-api";
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
  PostTopMediaKind,
  PostVisibility,
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
  topMediaKindInput: HTMLSelectElement;
  topMediaImageUrlInput: HTMLInputElement;
  topMediaYoutubeUrlInput: HTMLInputElement;
  topMediaVideoUrlInput: HTMLInputElement;
  contentKindInput: HTMLSelectElement;
  visibilityInput: HTMLSelectElement;
  seriesInput: HTMLInputElement;
  projectPeriodInput: HTMLInputElement;
  projectRoleSummaryInput: HTMLInputElement;
  projectIntroInput: HTMLTextAreaElement;
  projectHighlightsInput: HTMLTextAreaElement;
  projectResourceLinksInput: HTMLTextAreaElement;
  openPublishButton: HTMLButtonElement;
  confirmPublishButton: HTMLButtonElement;
  reauthUsernameInput: HTMLInputElement;
  reauthPasswordInput: HTMLInputElement;
  reauthFeedback: HTMLElement;
  reauthCancelButton: HTMLButtonElement;
  reauthConfirmButton: HTMLButtonElement;
  editorBridge: EditorBridge;
  isPublishLayerOpen: () => boolean;
  setPublishLayerOpen: (nextOpen: boolean) => void;
  setReauthLayerOpen: (nextOpen: boolean) => void;
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
    topMediaKindInput,
    topMediaImageUrlInput,
    topMediaYoutubeUrlInput,
    topMediaVideoUrlInput,
    contentKindInput,
    visibilityInput,
    seriesInput,
    projectPeriodInput,
    projectRoleSummaryInput,
    projectIntroInput,
    projectHighlightsInput,
    projectResourceLinksInput,
    openPublishButton,
    confirmPublishButton,
    reauthUsernameInput,
    reauthPasswordInput,
    reauthFeedback,
    reauthCancelButton,
    reauthConfirmButton,
    editorBridge,
    isPublishLayerOpen,
    setPublishLayerOpen,
    setReauthLayerOpen,
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

  type PendingPublishRetry = {
    request: SubmitRequestInfo;
    payload: ReturnType<typeof buildSubmitPayload>;
    contentKind: PostContentKind;
    status: PostStatus;
  };

  let pendingPublishRetry: PendingPublishRetry | null = null;

  const setReauthFeedback = (message: string, state: FeedbackState) => {
    reauthFeedback.dataset.state = state;
    reauthFeedback.textContent = message;
  };

  const resetReauthForm = () => {
    reauthPasswordInput.value = "";
    setReauthFeedback("세션이 만료되었습니다. 다시 로그인한 뒤 출간을 이어갑니다.", "info");
  };

  const submitPost = async (
    context: PendingPublishRetry,
    desiredStatus: string | null,
  ): Promise<void> => {
    const { request, payload, contentKind, status } = context;

    const submitResult = await requestPostSubmit(request, payload);
    if (!submitResult.ok) {
      if (submitResult.status === 401 && status === "published") {
        pendingPublishRetry = context;
        setReauthLayerOpen(true);
        setReauthFeedback("세션이 만료되었습니다. 다시 로그인해 주세요.", "error");
        reauthUsernameInput.focus();
        return;
      }

      if (
        submitResult.status === 409 &&
        isSlugAlreadyExistsError(submitResult.errorPayload)
      ) {
        let suggestedSlug: string | null = null;
        try {
          suggestedSlug = await suggestAvailableSlug(payload.slug);
        } catch {
          suggestedSlug = null;
        }

        if (desiredStatus === "published" && !isPublishLayerOpen()) {
          setPublishLayerOpen(true);
        }

        if (suggestedSlug && suggestedSlug !== payload.slug) {
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

    pendingPublishRetry = null;
    setReauthLayerOpen(false);
    resetReauthForm();

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
  };

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
    const topMediaKind: PostTopMediaKind =
      topMediaKindInput.value === "youtube"
        ? "youtube"
        : topMediaKindInput.value === "video"
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
      topMediaKind,
      topMediaImageUrl: topMediaImageUrlInput.value,
      topMediaYoutubeUrl: topMediaYoutubeUrlInput.value,
      topMediaVideoUrl: topMediaVideoUrlInput.value,
      contentKind,
      status,
      visibility,
      tags: getSelectedTags(),
      seriesTitle: seriesName,
      nowIso: new Date().toISOString(),
      projectPeriod: projectPeriod,
      projectRoleSummary: projectRole,
      projectIntro: projectIntroInput.value,
      projectHighlights: projectHighlightsInput.value,
      projectResourceLinks: projectResourceLinksInput.value,
    });
    const submitRequest = resolveSubmitRequest(getEditingPostSlug());

    showFeedback("게시글 저장 중...", "info", 0);
    openPublishButton.disabled = true;
    confirmPublishButton.disabled = true;

    try {
      await submitPost(
        {
          request: submitRequest,
          payload,
          contentKind,
          status,
        },
        desiredStatus,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.";
      showFeedback(message, "error");
    } finally {
      openPublishButton.disabled = false;
      confirmPublishButton.disabled = false;
    }
  });

  reauthCancelButton.addEventListener("click", () => {
    setReauthLayerOpen(false);
    resetReauthForm();
  });

  const handleReauthSubmit = async () => {
    if (!pendingPublishRetry) {
      setReauthFeedback("다시 시도할 출간 요청이 없습니다.", "error");
      return;
    }

    reauthConfirmButton.disabled = true;
    reauthCancelButton.disabled = true;
    setReauthFeedback("로그인 처리 중...", "pending");

    try {
      const loginResult = await requestAdminLogin(
        reauthUsernameInput.value,
        reauthPasswordInput.value,
      );
      if (!loginResult.ok) {
        setReauthFeedback(
          normalizeJsonError(loginResult.errorPayload),
          "error",
        );
        return;
      }

      setReauthFeedback("다시 출간 중...", "pending");
      await submitPost(pendingPublishRetry, "published");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다.";
      setReauthFeedback(message, "error");
    } finally {
      reauthConfirmButton.disabled = false;
      reauthCancelButton.disabled = false;
    }
  };

  reauthConfirmButton.addEventListener("click", () => {
    void handleReauthSubmit();
  });

  const handleReauthEnterKey = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleReauthSubmit();
  };

  reauthUsernameInput.addEventListener("keydown", handleReauthEnterKey);
  reauthPasswordInput.addEventListener("keydown", handleReauthEnterKey);
}
