export interface WriterDomElements {
  form: HTMLFormElement;
  writerShell: HTMLElement;
  feedback: HTMLElement;
  editorRoot: HTMLElement;
  titleInput: HTMLInputElement;
  slugInput: HTMLInputElement;
  slugFeedback: HTMLElement;
  excerptInput: HTMLTextAreaElement;
  coverInput: HTMLInputElement;
  visibilityInput: HTMLSelectElement;
  previewTitle: HTMLElement;
  previewContent: HTMLElement;
  coverPreview: HTMLElement;
  coverPreviewImage: HTMLImageElement;
  coverPreviewEmpty: HTMLElement;
  coverUploadInput: HTMLInputElement;
  compactToggleButton: HTMLButtonElement;
  uploadTrigger: HTMLButtonElement;
  uploadInput: HTMLInputElement;
  openDraftsButton: HTMLButtonElement;
  draftLayer: HTMLElement;
  draftBackdrop: HTMLButtonElement;
  closeDraftsButton: HTMLButtonElement;
  draftList: HTMLElement;
  draftFeedback: HTMLElement;
  openPublishButton: HTMLButtonElement;
  publishLayer: HTMLElement;
  publishBackdrop: HTMLButtonElement;
  closePublishButton: HTMLButtonElement;
  confirmPublishButton: HTMLButtonElement;
  editorDropZone: HTMLElement;
  coverDropZone: HTMLElement;
}

export function queryWriterDomElements(
  root: Document = document,
): WriterDomElements | null {
  const form = root.querySelector<HTMLFormElement>("#admin-post-form");
  if (!form) return null;

  const writerShell = root.querySelector<HTMLElement>(".writer-shell");
  const feedback = root.querySelector<HTMLElement>("#writer-toast");
  const editorRoot = root.querySelector<HTMLElement>("#milkdown-editor");
  const titleInput = root.querySelector<HTMLInputElement>("#post-title");
  const slugInput = root.querySelector<HTMLInputElement>("#post-slug");
  const slugFeedback = root.querySelector<HTMLElement>("#writer-slug-feedback");
  const excerptInput = root.querySelector<HTMLTextAreaElement>("#post-excerpt");
  const coverInput = root.querySelector<HTMLInputElement>("#post-cover");
  const visibilityInput =
    root.querySelector<HTMLSelectElement>("#post-visibility");
  const previewTitle = root.querySelector<HTMLElement>("#writer-preview-title");
  const previewContent = root.querySelector<HTMLElement>(
    "#writer-preview-content",
  );
  const coverPreview = root.querySelector<HTMLElement>("#writer-cover-preview");
  const coverPreviewImage = root.querySelector<HTMLImageElement>(
    "#writer-cover-preview-image",
  );
  const coverPreviewEmpty = root.querySelector<HTMLElement>(
    "#writer-cover-preview-empty",
  );
  const coverUploadInput = root.querySelector<HTMLInputElement>(
    "#writer-cover-upload-input",
  );
  const compactToggleButton = root.querySelector<HTMLButtonElement>(
    "#writer-toggle-compact-view",
  );
  const uploadTrigger = root.querySelector<HTMLButtonElement>(
    "#writer-upload-trigger",
  );
  const uploadInput = root.querySelector<HTMLInputElement>("#writer-upload-input");
  const openDraftsButton = root.querySelector<HTMLButtonElement>(
    "#writer-open-drafts",
  );
  const draftLayer = root.querySelector<HTMLElement>("#writer-draft-layer");
  const draftBackdrop = root.querySelector<HTMLButtonElement>(
    "#writer-draft-backdrop",
  );
  const closeDraftsButton = root.querySelector<HTMLButtonElement>(
    "#writer-close-drafts",
  );
  const draftList = root.querySelector<HTMLElement>("#writer-draft-list");
  const draftFeedback = root.querySelector<HTMLElement>("#writer-draft-feedback");
  const openPublishButton = root.querySelector<HTMLButtonElement>(
    "#writer-open-publish",
  );
  const publishLayer = root.querySelector<HTMLElement>("#writer-publish-layer");
  const publishBackdrop = root.querySelector<HTMLButtonElement>(
    "#writer-publish-backdrop",
  );
  const closePublishButton = root.querySelector<HTMLButtonElement>(
    "#writer-cancel-publish",
  );
  const confirmPublishButton = root.querySelector<HTMLButtonElement>(
    "#writer-confirm-publish",
  );
  const editorDropZone = root.querySelector<HTMLElement>(
    "#writer-editor-drop-zone",
  );
  const coverDropZone = root.querySelector<HTMLElement>("#writer-cover-drop-zone");

  if (
    !writerShell ||
    !feedback ||
    !editorRoot ||
    !titleInput ||
    !slugInput ||
    !slugFeedback ||
    !excerptInput ||
    !coverInput ||
    !visibilityInput ||
    !previewTitle ||
    !previewContent ||
    !coverPreview ||
    !coverPreviewImage ||
    !coverPreviewEmpty ||
    !coverUploadInput ||
    !compactToggleButton ||
    !uploadTrigger ||
    !uploadInput ||
    !openDraftsButton ||
    !draftLayer ||
    !draftBackdrop ||
    !closeDraftsButton ||
    !draftList ||
    !draftFeedback ||
    !openPublishButton ||
    !publishLayer ||
    !publishBackdrop ||
    !closePublishButton ||
    !confirmPublishButton ||
    !editorDropZone ||
    !coverDropZone
  ) {
    return null;
  }

  return {
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
  };
}
