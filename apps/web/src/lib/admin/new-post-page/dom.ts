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
  contentKindInput: HTMLSelectElement;
  visibilityInput: HTMLSelectElement;
  seriesInput: HTMLInputElement;
  tagInput: HTMLInputElement;
  slugPrefix: HTMLElement;
  metaPanel: HTMLElement;
  projectFields: HTMLElement;
  projectPeriodInput: HTMLInputElement;
  projectRoleSummaryInput: HTMLInputElement;
  projectIntroInput: HTMLTextAreaElement;
  projectDetailMediaKindInput: HTMLSelectElement;
  projectYoutubeUrlInput: HTMLInputElement;
  projectDetailVideoUrlInput: HTMLInputElement;
  projectVideoUploadTrigger: HTMLButtonElement;
  projectVideoUploadInput: HTMLInputElement;
  projectVideoPreview: HTMLVideoElement;
  projectHighlightsInput: HTMLTextAreaElement;
  projectResourceLinksInput: HTMLTextAreaElement;
  seriesSuggestionList: HTMLDataListElement;
  tagChipList: HTMLElement;
  metaChipRail: HTMLElement;
  tagSuggestionList: HTMLDataListElement;
  previewTitle: HTMLElement;
  previewMeta: HTMLElement;
  previewMetaKinds: HTMLElement;
  previewMetaSummary: HTMLElement;
  previewMetaSeries: HTMLElement;
  previewMetaTags: HTMLElement;
  previewMetaProject: HTMLElement;
  previewMetaHighlights: HTMLElement;
  previewMetaLinks: HTMLElement;
  previewContent: HTMLElement;
  coverPreview: HTMLElement;
  coverPreviewImage: HTMLImageElement;
  coverPreviewEmpty: HTMLElement;
  coverUploadInput: HTMLInputElement;
  compactToggleButton: HTMLButtonElement;
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

const WRITER_SELECTORS = {
  form: "#admin-post-form",
  writerShell: ".writer-shell",
  feedback: "#writer-toast",
  editorRoot: "#milkdown-editor",
  titleInput: "#post-title",
  slugInput: "#post-slug",
  slugFeedback: "#writer-slug-feedback",
  excerptInput: "#post-excerpt",
  coverInput: "#post-cover",
  contentKindInput: "#post-content-kind",
  visibilityInput: "#post-visibility",
  seriesInput: "#post-series",
  tagInput: "#post-tags",
  slugPrefix: "#writer-slug-prefix",
  metaPanel: "#writer-meta-panel",
  projectFields: "#writer-project-fields",
  projectPeriodInput: "#project-period",
  projectRoleSummaryInput: "#project-role-summary",
  projectIntroInput: "#project-intro",
  projectDetailMediaKindInput: "#project-detail-media-kind",
  projectYoutubeUrlInput: "#project-youtube-url",
  projectDetailVideoUrlInput: "#project-detail-video-url",
  projectVideoUploadTrigger: "#project-video-upload-trigger",
  projectVideoUploadInput: "#project-video-upload-input",
  projectVideoPreview: "#project-video-preview",
  projectHighlightsInput: "#project-highlights",
  projectResourceLinksInput: "#project-resource-links",
  seriesSuggestionList: "#writer-series-suggestions",
  tagChipList: "#writer-tag-chip-list",
  metaChipRail: "#writer-meta-chip-rail",
  tagSuggestionList: "#writer-tag-suggestions",
  previewTitle: "#writer-preview-title",
  previewMeta: "#writer-preview-meta",
  previewMetaKinds: "#writer-preview-meta-kinds",
  previewMetaSummary: "#writer-preview-meta-summary",
  previewMetaSeries: "#writer-preview-meta-series",
  previewMetaTags: "#writer-preview-meta-tags",
  previewMetaProject: "#writer-preview-meta-project",
  previewMetaHighlights: "#writer-preview-meta-highlights",
  previewMetaLinks: "#writer-preview-meta-links",
  previewContent: "#writer-preview-content",
  coverPreview: "#writer-cover-preview",
  coverPreviewImage: "#writer-cover-preview-image",
  coverPreviewEmpty: "#writer-cover-preview-empty",
  coverUploadInput: "#writer-cover-upload-input",
  compactToggleButton: "#writer-toggle-compact-view",
  openDraftsButton: "#writer-open-drafts",
  draftLayer: "#writer-draft-layer",
  draftBackdrop: "#writer-draft-backdrop",
  closeDraftsButton: "#writer-close-drafts",
  draftList: "#writer-draft-list",
  draftFeedback: "#writer-draft-feedback",
  openPublishButton: "#writer-open-publish",
  publishLayer: "#writer-publish-layer",
  publishBackdrop: "#writer-publish-backdrop",
  closePublishButton: "#writer-cancel-publish",
  confirmPublishButton: "#writer-confirm-publish",
  editorDropZone: "#writer-editor-drop-zone",
  coverDropZone: "#writer-cover-drop-zone",
} as const;

type QueriedWriterDomElements = {
  [K in Exclude<keyof WriterDomElements, "form">]: WriterDomElements[K] | null;
};

function queryElement<T extends Element>(
  root: Document,
  selector: string,
): T | null {
  return root.querySelector<T>(selector);
}

export function queryWriterDomElements(
  root: Document = document,
): WriterDomElements | null {
  const form = queryElement<HTMLFormElement>(root, WRITER_SELECTORS.form);
  if (!form) return null;

  const queried: QueriedWriterDomElements = {
    writerShell: queryElement<HTMLElement>(root, WRITER_SELECTORS.writerShell),
    feedback: queryElement<HTMLElement>(root, WRITER_SELECTORS.feedback),
    editorRoot: queryElement<HTMLElement>(root, WRITER_SELECTORS.editorRoot),
    titleInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.titleInput),
    slugInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.slugInput),
    slugFeedback: queryElement<HTMLElement>(root, WRITER_SELECTORS.slugFeedback),
    excerptInput: queryElement<HTMLTextAreaElement>(
      root,
      WRITER_SELECTORS.excerptInput,
    ),
    coverInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.coverInput),
    contentKindInput: queryElement<HTMLSelectElement>(root, WRITER_SELECTORS.contentKindInput),
    visibilityInput: queryElement<HTMLSelectElement>(
      root,
      WRITER_SELECTORS.visibilityInput,
    ),
    seriesInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.seriesInput),
    tagInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.tagInput),
    slugPrefix: queryElement<HTMLElement>(root, WRITER_SELECTORS.slugPrefix),
    metaPanel: queryElement<HTMLElement>(root, WRITER_SELECTORS.metaPanel),
    projectFields: queryElement<HTMLElement>(root, WRITER_SELECTORS.projectFields),
    projectPeriodInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.projectPeriodInput),
    projectRoleSummaryInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.projectRoleSummaryInput),
    projectIntroInput: queryElement<HTMLTextAreaElement>(root, WRITER_SELECTORS.projectIntroInput),
    projectDetailMediaKindInput: queryElement<HTMLSelectElement>(root, WRITER_SELECTORS.projectDetailMediaKindInput),
    projectYoutubeUrlInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.projectYoutubeUrlInput),
    projectDetailVideoUrlInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.projectDetailVideoUrlInput),
    projectVideoUploadTrigger: queryElement<HTMLButtonElement>(root, WRITER_SELECTORS.projectVideoUploadTrigger),
    projectVideoUploadInput: queryElement<HTMLInputElement>(root, WRITER_SELECTORS.projectVideoUploadInput),
    projectVideoPreview: queryElement<HTMLVideoElement>(root, WRITER_SELECTORS.projectVideoPreview),
    projectHighlightsInput: queryElement<HTMLTextAreaElement>(root, WRITER_SELECTORS.projectHighlightsInput),
    projectResourceLinksInput: queryElement<HTMLTextAreaElement>(root, WRITER_SELECTORS.projectResourceLinksInput),
    seriesSuggestionList: queryElement<HTMLDataListElement>(
      root,
      WRITER_SELECTORS.seriesSuggestionList,
    ),
    tagChipList: queryElement<HTMLElement>(root, WRITER_SELECTORS.tagChipList),
    metaChipRail: queryElement<HTMLElement>(root, WRITER_SELECTORS.metaChipRail),
    tagSuggestionList: queryElement<HTMLDataListElement>(
      root,
      WRITER_SELECTORS.tagSuggestionList,
    ),
    previewTitle: queryElement<HTMLElement>(root, WRITER_SELECTORS.previewTitle),
    previewMeta: queryElement<HTMLElement>(root, WRITER_SELECTORS.previewMeta),
    previewMetaKinds: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewMetaKinds,
    ),
    previewMetaSummary: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewMetaSummary,
    ),
    previewMetaSeries: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewMetaSeries,
    ),
    previewMetaTags: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewMetaTags,
    ),
    previewMetaProject: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewMetaProject,
    ),
    previewMetaHighlights: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewMetaHighlights,
    ),
    previewMetaLinks: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewMetaLinks,
    ),
    previewContent: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.previewContent,
    ),
    coverPreview: queryElement<HTMLElement>(root, WRITER_SELECTORS.coverPreview),
    coverPreviewImage: queryElement<HTMLImageElement>(
      root,
      WRITER_SELECTORS.coverPreviewImage,
    ),
    coverPreviewEmpty: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.coverPreviewEmpty,
    ),
    coverUploadInput: queryElement<HTMLInputElement>(
      root,
      WRITER_SELECTORS.coverUploadInput,
    ),
    compactToggleButton: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.compactToggleButton,
    ),
    openDraftsButton: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.openDraftsButton,
    ),
    draftLayer: queryElement<HTMLElement>(root, WRITER_SELECTORS.draftLayer),
    draftBackdrop: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.draftBackdrop,
    ),
    closeDraftsButton: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.closeDraftsButton,
    ),
    draftList: queryElement<HTMLElement>(root, WRITER_SELECTORS.draftList),
    draftFeedback: queryElement<HTMLElement>(root, WRITER_SELECTORS.draftFeedback),
    openPublishButton: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.openPublishButton,
    ),
    publishLayer: queryElement<HTMLElement>(root, WRITER_SELECTORS.publishLayer),
    publishBackdrop: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.publishBackdrop,
    ),
    closePublishButton: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.closePublishButton,
    ),
    confirmPublishButton: queryElement<HTMLButtonElement>(
      root,
      WRITER_SELECTORS.confirmPublishButton,
    ),
    editorDropZone: queryElement<HTMLElement>(
      root,
      WRITER_SELECTORS.editorDropZone,
    ),
    coverDropZone: queryElement<HTMLElement>(root, WRITER_SELECTORS.coverDropZone),
  };

  if (Object.values(queried).some((element) => element === null)) {
    return null;
  }

  return {
    form,
    ...(queried as Omit<WriterDomElements, "form">),
  };
}
