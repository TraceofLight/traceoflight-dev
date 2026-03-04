export type FeedbackState = "info" | "ok" | "error";

export interface DraftLoadOptions {
  updateQuery?: boolean;
  showToast?: boolean;
}

export type DraftDeleteOutcome = "ok" | "http_error" | "network_error";

export interface DraftLayerBindings {
  openDraftsButton: HTMLButtonElement;
  closeDraftsButton: HTMLButtonElement;
  draftBackdrop: HTMLButtonElement;
  draftList: HTMLElement;
  setPublishLayerOpen: (nextOpen: boolean) => void;
  setDraftLayerOpen: (nextOpen: boolean) => void;
  loadDraftList: () => Promise<void>;
  loadDraftBySlug: (slug: string, options?: DraftLoadOptions) => Promise<boolean>;
  requestDraftDeleteBySlug: (slug: string) => Promise<DraftDeleteOutcome>;
  setDraftFeedback: (message: string, state: FeedbackState) => void;
  getEditingPostSlug: () => string | null;
  setEditingPostSlug: (nextSlug: string | null) => void;
  updateDraftQueryParam: (nextSlug: string | null) => void;
}

export function bindDraftLayerEvents(bindings: DraftLayerBindings): void {
  const {
    openDraftsButton,
    closeDraftsButton,
    draftBackdrop,
    draftList,
    setPublishLayerOpen,
    setDraftLayerOpen,
    loadDraftList,
    loadDraftBySlug,
    requestDraftDeleteBySlug,
    setDraftFeedback,
    getEditingPostSlug,
    setEditingPostSlug,
    updateDraftQueryParam,
  } = bindings;

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
      const deleteResult = await requestDraftDeleteBySlug(slug);
      if (deleteResult !== "ok") {
        if (deleteResult === "network_error") {
          setDraftFeedback("네트워크 오류로 삭제하지 못했습니다.", "error");
        } else {
          setDraftFeedback("임시저장 글 삭제에 실패했습니다.", "error");
        }
        target.disabled = false;
        return;
      }

      if (getEditingPostSlug() === slug) {
        setEditingPostSlug(null);
        updateDraftQueryParam(null);
      }
      setDraftFeedback("임시저장 글을 삭제했습니다.", "ok");
      await loadDraftList();
    }
  });
}
