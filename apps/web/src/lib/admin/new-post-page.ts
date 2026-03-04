import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';
import { replaceAll } from '@milkdown/utils';

import { createMarkdownRenderer } from '../markdown-renderer';

type PostStatus = 'draft' | 'published';
type AssetKind = 'image' | 'video' | 'file';

interface UploadUrlResponse {
  object_key: string;
  bucket: string;
  upload_url: string;
  expires_in_seconds: number;
}

interface UploadBundle {
  mediaUrl: string;
  snippet: string;
}

interface AdminPostPayload {
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  status: PostStatus;
}

interface AdminDraftListItem {
  slug: string;
  title?: string | null;
  status?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

interface EditorBridge {
  mode: 'crepe' | 'fallback';
  initError?: string;
  getMarkdown: () => Promise<string>;
  setMarkdown: (markdown: string) => Promise<void>;
  observeChanges: (onChange: () => void) => () => void;
}

type DropTarget = 'body' | 'cover' | null;

const markdownPreview = createMarkdownRenderer();

const PRIVATE_UPLOAD_HOSTS = new Set(['localhost', '127.0.0.1', 'traceoflight-minio', 'minio']);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveAssetKind(mimeType: string): AssetKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function buildMediaUrl(baseUrl: string, objectKey: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return `${trimmed}/${objectKey}`;
}

function buildMarkdownSnippet(kind: AssetKind, fileName: string, mediaUrl: string): string {
  if (kind === 'image') return `![${fileName}](${mediaUrl})`;
  if (kind === 'video') return `<video controls src="${mediaUrl}"></video>`;
  return `[${fileName}](${mediaUrl})`;
}

function setFeedback(
  target: HTMLElement,
  message: string,
  type: 'error' | 'ok' | 'info',
  options: { autoHideMs?: number; hideTimerRef?: { id: number | null } } = {},
): void {
  const autoHideMs = options.autoHideMs ?? 3200;
  target.textContent = message;
  target.dataset.state = type;
  target.setAttribute('data-visible', 'true');

  if (options.hideTimerRef && options.hideTimerRef.id !== null) {
    window.clearTimeout(options.hideTimerRef.id);
    options.hideTimerRef.id = null;
  }

  if (autoHideMs <= 0) return;

  const timerId = window.setTimeout(() => {
    target.setAttribute('data-visible', 'false');
    if (options.hideTimerRef) {
      options.hideTimerRef.id = null;
    }
  }, autoHideMs);

  if (options.hideTimerRef) {
    options.hideTimerRef.id = timerId;
  }
}

function normalizeJsonError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'request failed';
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim().length > 0) return message;
  return 'request failed';
}

function isSlugAlreadyExistsError(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail !== 'string') return false;
  return detail.toLowerCase().includes('post slug already exists');
}

async function doesSlugExist(slug: string): Promise<boolean> {
  const response = await fetch(`/internal-api/posts/${encodeURIComponent(slug)}`);
  if (response.status === 404) return false;
  return response.ok;
}

async function suggestAvailableSlug(baseSlug: string): Promise<string | null> {
  const normalizedBase = slugify(baseSlug) || 'post';
  if (!(await doesSlugExist(normalizedBase))) return normalizedBase;
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${normalizedBase}-${suffix}`;
    if (!(await doesSlugExist(candidate))) {
      return candidate;
    }
  }
  return null;
}

function tryDecodeUrlParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeGoogleRedirectUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!parsed.hostname.endsWith('google.com') || parsed.pathname !== '/url') {
      return value;
    }
    const target = parsed.searchParams.get('url');
    if (!target) return value;
    return tryDecodeUrlParam(target);
  } catch {
    return value;
  }
}

function normalizeHttpForHttpsPage(value: string, pageProtocol: string): { value: string; upgraded: boolean } {
  try {
    const parsed = new URL(value);
    if (pageProtocol === 'https:' && parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return { value: parsed.toString(), upgraded: true };
    }
    return { value: parsed.toString(), upgraded: false };
  } catch {
    return { value, upgraded: false };
  }
}

function normalizeCoverUrl(rawValue: string, pageProtocol: string): { value: string; message?: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) return { value: '' };

  const redirected = normalizeGoogleRedirectUrl(trimmed);
  const upgraded = normalizeHttpForHttpsPage(redirected, pageProtocol);

  if (redirected !== trimmed) {
    return {
      value: upgraded.value,
      message: 'Google redirect URL was converted to the original source URL.',
    };
  }

  if (upgraded.upgraded) {
    return {
      value: upgraded.value,
      message: 'HTTP URL was upgraded to HTTPS to avoid mixed-content blocking.',
    };
  }

  return { value: upgraded.value };
}

const LINK_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const RELATIVE_LINK_PATTERN = /^(#|\/|\.\.?\/)/;

function looksLikeExternalHost(value: string): boolean {
  if (value.startsWith('www.')) return true;
  if (value.includes('@')) return false;
  const hostCandidate = value.split('/')[0];
  if (!hostCandidate.includes('.')) return false;
  return /^[a-z0-9.-]+$/i.test(hostCandidate);
}

function normalizeMarkdownLinkTarget(rawUrl: string, pageProtocol: string): string {
  const compactUrl = rawUrl.replace(/\s+/g, '');
  if (!compactUrl) return compactUrl;

  if (RELATIVE_LINK_PATTERN.test(compactUrl)) return compactUrl;

  if (compactUrl.startsWith('//')) {
    const protocol = pageProtocol === 'https:' ? 'https:' : 'http:';
    return normalizeCoverUrl(`${protocol}${compactUrl}`, pageProtocol).value;
  }

  if (LINK_SCHEME_PATTERN.test(compactUrl)) {
    if (!/^https?:\/\//i.test(compactUrl)) return compactUrl;
    return normalizeCoverUrl(compactUrl, pageProtocol).value;
  }

  if (looksLikeExternalHost(compactUrl)) {
    return normalizeCoverUrl(`https://${compactUrl}`, pageProtocol).value;
  }

  return compactUrl;
}

function splitMarkdownDestinationAndTitle(rawTarget: string): { destination: string; titlePart: string } {
  const trimmed = rawTarget.trim();
  if (!trimmed) return { destination: '', titlePart: '' };

  if (trimmed.startsWith('<')) {
    const closingIndex = trimmed.indexOf('>');
    if (closingIndex > 0) {
      const destination = trimmed.slice(1, closingIndex).trim();
      const titlePart = trimmed.slice(closingIndex + 1).trim();
      return { destination, titlePart };
    }
  }

  const titleMatch = trimmed.match(/^(.*?)(?:\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))\s*$/);
  if (!titleMatch) return { destination: trimmed, titlePart: '' };

  const destination = titleMatch[1].trim();
  const titlePart = titleMatch[2].trim();
  return { destination, titlePart };
}

function rebuildMarkdownLinkTarget(destination: string, titlePart: string): string {
  if (!titlePart) return destination;
  return `${destination} ${titlePart}`.trim();
}

function normalizeMarkdownLinkRawTarget(rawTarget: string, pageProtocol: string): string {
  const { destination, titlePart } = splitMarkdownDestinationAndTitle(rawTarget);
  if (!destination) return rawTarget.trim();
  const normalizedDestination = normalizeMarkdownLinkTarget(destination, pageProtocol);
  return rebuildMarkdownLinkTarget(normalizedDestination, titlePart);
}

function normalizeEscapedMarkdownLinks(markdown: string, pageProtocol: string): string {
  return markdown.replace(/\\(!?\[(?:\\.|[^\]])*\\?\])\\?\(([\s\S]*?)\\?\)/g, (full, rawLabel, rawUrl) => {
    const normalizedUrl = normalizeMarkdownLinkRawTarget(rawUrl, pageProtocol);
    if (!normalizedUrl) return full;
    const label = rawLabel.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    return `${label}(${normalizedUrl})`;
  });
}

function normalizeMarkdownLinks(markdown: string, pageProtocol: string): string {
  const normalizedEscaped = normalizeEscapedMarkdownLinks(markdown, pageProtocol);
  return normalizedEscaped.replace(/(!?\[[^\]]*]\()([\s\S]*?)(\))/g, (full, prefix, rawUrl, suffix) => {
    const normalized = normalizeMarkdownLinkRawTarget(rawUrl, pageProtocol);
    return `${prefix}${normalized}${suffix}`;
  });
}

function isLikelyImageLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^!\[[^\]]*]\([\s\S]*\)$/.test(trimmed)) return true;
  if (/^<img\b[\s\S]*>$/i.test(trimmed)) return true;
  if (/^<\/?figure\b[\s\S]*>$/i.test(trimmed)) return true;
  if (/^<\/?figcaption\b[\s\S]*>$/i.test(trimmed)) return true;
  return false;
}

function isLikelyImageScaleLine(line: string): boolean {
  const trimmed = line.trim();
  if (!/^\d+\.\d+$/.test(trimmed)) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 5;
}

function findNearestNonEmptyLine(lines: string[], startIndex: number, direction: 1 | -1): string | null {
  let index = startIndex + direction;
  while (index >= 0 && index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed.length > 0) return trimmed;
    index += direction;
  }
  return null;
}

function sanitizeEditorMarkdown(markdown: string): string {
  const withoutObjectChars = markdown.replace(/\uFFFC/g, '');
  const normalized = withoutObjectChars.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const filtered = lines.filter((line, index) => {
    if (!isLikelyImageScaleLine(line)) return true;
    const prev = findNearestNonEmptyLine(lines, index, -1);
    if (!prev) return true;
    return !isLikelyImageLine(prev);
  });
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n');
}

function shouldProxyUpload(uploadUrl: string): boolean {
  try {
    const parsed = new URL(uploadUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    if (window.location.protocol === 'https:' && parsed.protocol === 'http:') return true;
    return PRIVATE_UPLOAD_HOSTS.has(parsed.hostname);
  } catch {
    return true;
  }
}

function normalizeMediaBaseUrl(rawValue: string, origin: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.length > 0) return trimmed.replace(/\/+$/, '');
  return `${origin}/media`;
}

function extractFileFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

async function uploadBinaryToStorage(uploadUrl: string, file: File): Promise<void> {
  const binaryContentType = file.type || 'application/octet-stream';

  if (shouldProxyUpload(uploadUrl)) {
    const response = await fetch('/internal-api/media/upload-proxy', {
      method: 'POST',
      headers: {
        'content-type': binaryContentType,
        'x-upload-url': uploadUrl,
        'x-upload-content-type': binaryContentType,
      },
      body: file,
    });
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as unknown;
      throw new Error(normalizeJsonError(errorPayload));
    }
    return;
  }

  const uploadResult = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': binaryContentType },
    body: file,
  });
  if (!uploadResult.ok) {
    throw new Error('failed to upload file to object storage');
  }
}

async function createUploadBundle(file: File, mediaBaseUrl: string): Promise<UploadBundle> {
  const kind = resolveAssetKind(file.type);

  const uploadUrlResponse = await fetch('/internal-api/media/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
    }),
  });

  if (!uploadUrlResponse.ok) {
    const errorPayload = (await uploadUrlResponse.json().catch(() => null)) as unknown;
    throw new Error(normalizeJsonError(errorPayload));
  }

  const uploadInfo = (await uploadUrlResponse.json()) as UploadUrlResponse;
  await uploadBinaryToStorage(uploadInfo.upload_url, file);

  const registerResponse = await fetch('/internal-api/media/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      original_filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      object_key: uploadInfo.object_key,
      size_bytes: file.size,
    }),
  });
  if (!registerResponse.ok) {
    const errorPayload = (await registerResponse.json().catch(() => null)) as unknown;
    throw new Error(normalizeJsonError(errorPayload));
  }

  const mediaUrl = buildMediaUrl(mediaBaseUrl, uploadInfo.object_key);
  return {
    mediaUrl,
    snippet: buildMarkdownSnippet(kind, file.name, mediaUrl),
  };
}

async function createEditorBridge(editorRoot: HTMLElement, initialValue: string): Promise<EditorBridge> {
  try {
    const editor = new Crepe({
      root: editorRoot,
      defaultValue: initialValue,
    });
    await editor.create();

    return {
      mode: 'crepe',
      getMarkdown: async () => {
        const markdown = editor.getMarkdown();
        if (typeof markdown === 'string') return markdown;
        return await markdown;
      },
      setMarkdown: async (markdown: string) => {
        editor.editor.action(replaceAll(markdown));
      },
      observeChanges: (onChange: () => void) => {
        const observer = new MutationObserver(() => onChange());
        observer.observe(editorRoot, { childList: true, subtree: true, characterData: true });
        editorRoot.addEventListener('input', onChange);
        editorRoot.addEventListener('keyup', onChange);
        return () => {
          observer.disconnect();
          editorRoot.removeEventListener('input', onChange);
          editorRoot.removeEventListener('keyup', onChange);
        };
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown init error';
    console.error('[writer] crepe init failed:', error);

    const textarea = document.createElement('textarea');
    textarea.id = 'writer-fallback-textarea';
    textarea.className = 'writer-fallback-textarea';
    textarea.value = initialValue;
    textarea.placeholder = 'Write your story here...';
    editorRoot.replaceChildren(textarea);

    return {
      mode: 'fallback',
      initError: message,
      getMarkdown: async () => textarea.value,
      setMarkdown: async (markdown: string) => {
        textarea.value = markdown;
      },
      observeChanges: (onChange: () => void) => {
        textarea.addEventListener('input', onChange);
        return () => textarea.removeEventListener('input', onChange);
      },
    };
  }
}

export async function initNewPostAdminPage(): Promise<void> {
  const form = document.querySelector<HTMLFormElement>('#admin-post-form');
  if (!form) return;

  const feedback = document.querySelector<HTMLElement>('#writer-toast');
  const editorRoot = document.querySelector<HTMLElement>('#milkdown-editor');
  const titleInput = document.querySelector<HTMLInputElement>('#post-title');
  const slugInput = document.querySelector<HTMLInputElement>('#post-slug');
  const slugFeedback = document.querySelector<HTMLElement>('#writer-slug-feedback');
  const excerptInput = document.querySelector<HTMLTextAreaElement>('#post-excerpt');
  const coverInput = document.querySelector<HTMLInputElement>('#post-cover');
  const statusInput = document.querySelector<HTMLSelectElement>('#post-status');
  const previewTitle = document.querySelector<HTMLElement>('#writer-preview-title');
  const previewContent = document.querySelector<HTMLElement>('#writer-preview-content');
  const coverPreview = document.querySelector<HTMLElement>('#writer-cover-preview');
  const coverPreviewImage = document.querySelector<HTMLImageElement>('#writer-cover-preview-image');
  const coverPreviewEmpty = document.querySelector<HTMLElement>('#writer-cover-preview-empty');
  const coverUploadInput = document.querySelector<HTMLInputElement>('#writer-cover-upload-input');
  const uploadTrigger = document.querySelector<HTMLButtonElement>('#writer-upload-trigger');
  const uploadInput = document.querySelector<HTMLInputElement>('#writer-upload-input');
  const openDraftsButton = document.querySelector<HTMLButtonElement>('#writer-open-drafts');
  const draftLayer = document.querySelector<HTMLElement>('#writer-draft-layer');
  const draftBackdrop = document.querySelector<HTMLButtonElement>('#writer-draft-backdrop');
  const closeDraftsButton = document.querySelector<HTMLButtonElement>('#writer-close-drafts');
  const draftList = document.querySelector<HTMLElement>('#writer-draft-list');
  const draftFeedback = document.querySelector<HTMLElement>('#writer-draft-feedback');
  const openPublishButton = document.querySelector<HTMLButtonElement>('#writer-open-publish');
  const publishLayer = document.querySelector<HTMLElement>('#writer-publish-layer');
  const publishBackdrop = document.querySelector<HTMLButtonElement>('#writer-publish-backdrop');
  const closePublishButton = document.querySelector<HTMLButtonElement>('#writer-cancel-publish');
  const confirmPublishButton = document.querySelector<HTMLButtonElement>('#writer-confirm-publish');
  const editorDropZone = document.querySelector<HTMLElement>('#writer-editor-drop-zone');
  const coverDropZone = document.querySelector<HTMLElement>('#writer-cover-drop-zone');

  if (
    !feedback ||
    !editorRoot ||
    !titleInput ||
    !slugInput ||
    !slugFeedback ||
    !excerptInput ||
    !coverInput ||
    !statusInput ||
    !previewTitle ||
    !previewContent ||
    !coverPreview ||
    !coverPreviewImage ||
    !coverPreviewEmpty ||
    !coverUploadInput ||
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
    return;
  }

  const toastTimer = { id: null as number | null };
  const showFeedback = (message: string, type: 'error' | 'ok' | 'info', autoHideMs?: number) => {
    setFeedback(feedback, message, type, { autoHideMs, hideTimerRef: toastTimer });
  };
  const setDraftFeedback = (message: string, state: 'info' | 'ok' | 'error') => {
    draftFeedback.textContent = message;
    draftFeedback.dataset.state = state;
  };

  const mediaBaseUrl = normalizeMediaBaseUrl(form.dataset.mediaBaseUrl ?? '', window.location.origin);
  const editorBridge = await createEditorBridge(editorRoot, '');
  if (editorBridge.mode === 'fallback') {
    showFeedback(
      `Editor initialization failed, switched to fallback textarea: ${editorBridge.initError ?? 'unknown'}`,
      'error',
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
    draftLayer.setAttribute('data-open', nextOpen ? 'true' : 'false');
  };

  const isDraftLayerOpen = () => draftLayer.getAttribute('data-open') === 'true';

  const toDateLabel = (isoValue: string | null | undefined) => {
    if (!isoValue) return '';
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  };

  const setSlugValidationState = (state: 'idle' | 'error', message = '') => {
    slugFeedback.dataset.state = state;
    slugFeedback.textContent = state === 'error' ? message : '';
    slugInput.setAttribute('aria-invalid', state === 'error' ? 'true' : 'false');
  };

  const validateSlugAvailability = async (source: 'typing' | 'submit'): Promise<boolean> => {
    const slug = slugInput.value.trim();
    if (!slug) {
      setSlugValidationState('idle');
      return false;
    }

    if (editingPostSlug && slug === editingPostSlug) {
      setSlugValidationState('idle');
      return false;
    }

    const checkId = ++slugCheckSequence;
    let exists = false;
    try {
      exists = await doesSlugExist(slug);
    } catch {
      if (source === 'submit') {
        showFeedback('slug 중복 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      }
      return false;
    }

    if (checkId !== slugCheckSequence) return false;

    if (exists) {
      setSlugValidationState('error', '이미 사용 중인 주소입니다. 다른 Post URL을 입력해 주세요.');
      return true;
    }

    setSlugValidationState('idle');
    return false;
  };

  const queueSlugAvailabilityCheck = () => {
    if (slugCheckTimer !== null) {
      window.clearTimeout(slugCheckTimer);
      slugCheckTimer = null;
    }

    if (!slugInput.value.trim()) {
      setSlugValidationState('idle');
      return;
    }

    slugCheckTimer = window.setTimeout(() => {
      slugCheckTimer = null;
      void validateSlugAvailability('typing');
    }, 1000);
  };
  setSlugValidationState('idle');

  const setDropTargetState = (target: DropTarget) => {
    if (activeDropTarget === target) return;
    activeDropTarget = target;
    editorDropZone.setAttribute('data-drop-state', target === 'body' ? 'active' : 'idle');
    coverDropZone.setAttribute('data-drop-state', target === 'cover' ? 'active' : 'idle');
    coverPreview.setAttribute('data-drop-state', target === 'cover' ? 'active' : 'idle');
  };

  const clearDropTargetState = () => {
    setDropTargetState(null);
  };

  const setPublishLayerOpen = (nextOpen: boolean) => {
    publishLayer.hidden = !nextOpen;
    publishLayer.setAttribute('data-open', nextOpen ? 'true' : 'false');
    confirmPublishButton.disabled = false;
    if (nextOpen) {
      statusInput.value = 'published';
    }
  };

  const isPublishLayerOpen = () => publishLayer.getAttribute('data-open') === 'true';

  const resolveDropTarget = (event: DragEvent): DropTarget => {
    const eventTarget = event.target;
    const element =
      eventTarget instanceof Element
        ? eventTarget
        : eventTarget instanceof Node
          ? eventTarget.parentElement
          : null;
    if (!element) return null;
    if (element.closest('#writer-cover-drop-zone')) return 'cover';
    if (element.closest('#writer-cover-preview')) return 'cover';
    if (element.closest('#writer-editor-drop-zone') || element.closest('#milkdown-editor')) return 'body';
    return null;
  };

  const normalizeCoverInputValue = (withMessage: boolean) => {
    const normalized = normalizeCoverUrl(coverInput.value, window.location.protocol);
    const changed = normalized.value !== coverInput.value.trim();
    if (changed) {
      coverInput.value = normalized.value;
    }
    if (withMessage && normalized.message) {
      showFeedback(normalized.message, 'info');
    }
    return normalized.value;
  };

  const renderCoverPreviewEmpty = (message: string) => {
    coverPreview.setAttribute('data-empty', 'true');
    coverPreviewImage.hidden = true;
    coverPreviewImage.removeAttribute('src');
    coverPreviewEmpty.textContent = message;
  };

  const renderCoverPreviewImage = (url: string) => {
    coverPreview.setAttribute('data-empty', 'false');
    coverPreviewEmpty.textContent = '';
    coverPreviewImage.hidden = false;
    coverPreviewImage.src = url;
  };

  const renderCoverPreview = (url: string) => {
    if (!url) {
      renderCoverPreviewEmpty('커버 이미지를 설정하면 여기에 미리보기가 표시됩니다.');
      return;
    }
    renderCoverPreviewImage(url);
  };

  coverPreviewImage.addEventListener('error', () => {
    renderCoverPreviewEmpty('이미지를 불러오지 못했습니다. URL을 확인하세요.');
  });

  coverPreviewImage.addEventListener('load', () => {
    coverPreview.setAttribute('data-empty', 'false');
    coverPreviewEmpty.textContent = '';
    coverPreviewImage.hidden = false;
  });

  const refreshPreview = async () => {
    const markdown = sanitizeEditorMarkdown(await editorBridge.getMarkdown());
    const normalizedMarkdown = normalizeMarkdownLinks(markdown, window.location.protocol);
    const hasBodyContent = normalizedMarkdown.trim().length > 0;
    editorDropZone.setAttribute('data-has-content', hasBodyContent ? 'true' : 'false');
    if (hasBodyContent) {
      previewContent.innerHTML = markdownPreview.render(normalizedMarkdown);
    } else {
      previewContent.innerHTML = '<p class="writer-preview-empty">본문을 입력하면 여기에 미리보기가 표시됩니다.</p>';
    }

    const nextTitle = titleInput.value.trim() || '제목 없음';

    previewTitle.textContent = nextTitle;
    renderCoverPreview(coverInput.value.trim());
  };

  const queuePreviewRefresh = () => {
    if (previewJobQueued) return;
    previewJobQueued = true;
    window.requestAnimationFrame(async () => {
      previewJobQueued = false;
      await refreshPreview();
    });
  };

  const updateDraftQueryParam = (draftSlug: string | null) => {
    const nextUrl = new URL(window.location.href);
    if (draftSlug) {
      nextUrl.searchParams.set('draft', draftSlug);
    } else {
      nextUrl.searchParams.delete('draft');
    }
    const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    window.history.replaceState({}, '', nextPath);
  };

  const applyDraftPayload = async (loaded: Partial<AdminPostPayload>, fallbackSlug: string) => {
    editingPostSlug = loaded.slug?.trim() || fallbackSlug;
    titleInput.value = loaded.title?.trim() ?? '';
    slugInput.value = loaded.slug?.trim() || fallbackSlug;
    slugInput.dataset.touched = 'true';
    excerptInput.value = loaded.excerpt ?? '';
    coverInput.value = loaded.cover_image_url ?? '';
    statusInput.value = loaded.status === 'published' ? 'published' : 'draft';
    await editorBridge.setMarkdown(loaded.body_markdown ?? '');
    setSlugValidationState('idle');
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
      const response = await fetch(`/internal-api/posts/${encodeURIComponent(normalizedSlug)}?status=draft`);
      if (response.status === 404) {
        showFeedback('요청한 임시저장 글을 찾지 못했습니다.', 'error');
        return false;
      }
      if (!response.ok) {
        showFeedback('임시저장 글을 불러오지 못했습니다.', 'error');
        return false;
      }

      const loaded = (await response.json()) as Partial<AdminPostPayload>;
      await applyDraftPayload(loaded, normalizedSlug);
      if (options.updateQuery !== false) {
        updateDraftQueryParam(editingPostSlug || normalizedSlug);
      }
      if (options.showToast !== false) {
        showFeedback(`임시저장 글을 불러왔습니다: ${titleInput.value || '제목 없음'}`, 'ok');
      }
      return true;
    } catch {
      showFeedback('네트워크 오류로 임시저장 글을 불러오지 못했습니다.', 'error');
      return false;
    }
  };

  const loadDraftFromQuery = async () => {
    const draftSlug = new URLSearchParams(window.location.search).get('draft')?.trim() ?? '';
    if (!draftSlug) return;

    await loadDraftBySlug(draftSlug, { updateQuery: true, showToast: true });
  };

  const renderDraftListEmpty = (message: string) => {
    draftList.innerHTML = `<li class="writer-draft-empty">${message}</li>`;
  };

  const createDraftListItem = (post: AdminDraftListItem) => {
    const item = document.createElement('li');
    item.className = 'writer-draft-item';

    const main = document.createElement('div');
    main.className = 'writer-draft-main';

    const titleButton = document.createElement('button');
    titleButton.type = 'button';
    titleButton.className = 'writer-draft-title';
    titleButton.dataset.slug = post.slug;
    titleButton.textContent = post.title?.trim() || '제목 없음';

    const meta = document.createElement('p');
    meta.className = 'writer-draft-meta';
    meta.textContent = `${post.slug} · ${toDateLabel(post.updated_at || post.created_at)}`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'writer-draft-delete';
    removeButton.dataset.slug = post.slug;
    removeButton.setAttribute('aria-label', `${post.title?.trim() || post.slug} 삭제`);
    removeButton.textContent = 'x';

    main.append(titleButton, meta);
    item.append(main, removeButton);
    return item;
  };

  const loadDraftList = async () => {
    setDraftFeedback('임시저장 글을 불러오는 중...', 'info');
    renderDraftListEmpty('임시저장 글을 불러오는 중입니다.');

    try {
      const response = await fetch('/internal-api/posts?status=draft&limit=100&offset=0');
      if (!response.ok) {
        renderDraftListEmpty('불러오기 실패');
        setDraftFeedback('임시저장 목록을 불러오지 못했습니다.', 'error');
        return;
      }

      const posts = (await response.json()) as unknown;
      const drafts = Array.isArray(posts)
        ? (posts as AdminDraftListItem[])
            .filter((post) => post?.status === 'draft' && typeof post?.slug === 'string')
            .sort((a, b) => {
              const leftTitle = a.title?.trim() || '제목 없음';
              const rightTitle = b.title?.trim() || '제목 없음';
              const titleOrder = leftTitle.localeCompare(rightTitle, 'ko');
              if (titleOrder !== 0) return titleOrder;
              return (a.slug || '').localeCompare(b.slug || '', 'ko');
            })
        : [];

      draftList.innerHTML = '';
      if (drafts.length === 0) {
        renderDraftListEmpty('임시저장 글이 없습니다.');
        setDraftFeedback('', 'info');
        return;
      }

      drafts.forEach((post) => {
        draftList.append(createDraftListItem(post));
      });
      setDraftFeedback('', 'info');
    } catch {
      renderDraftListEmpty('불러오기 실패');
      setDraftFeedback('네트워크 오류로 임시저장 목록을 불러오지 못했습니다.', 'error');
    }
  };

  const insertSnippet = async (snippet: string) => {
    const currentMarkdown = await editorBridge.getMarkdown();
    await editorBridge.setMarkdown(`${currentMarkdown.trimEnd()}\n\n${snippet}\n`);
    queuePreviewRefresh();
  };

  const uploadOneFileToBody = async (file: File) => {
    if (isUploading) {
      showFeedback('이미 업로드를 처리 중입니다. 잠시만 기다려 주세요.', 'info');
      return;
    }

    isUploading = true;
    showFeedback('미디어 업로드 중...', 'info', 0);
    uploadTrigger.disabled = true;

    try {
      const bundle = await createUploadBundle(file, mediaBaseUrl);
      await insertSnippet(bundle.snippet);
      showFeedback('업로드 완료, 본문에 삽입했습니다.', 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : '미디어 업로드 중 오류가 발생했습니다.';
      showFeedback(message, 'error');
    } finally {
      isUploading = false;
      uploadTrigger.disabled = false;
      uploadInput.value = '';
    }
  };

  const uploadOneFileToCover = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showFeedback('커버 이미지는 이미지 파일만 지원합니다.', 'error');
      return;
    }

    if (isUploading) {
      showFeedback('이미 업로드를 처리 중입니다. 잠시만 기다려 주세요.', 'info');
      return;
    }

    isUploading = true;
    showFeedback('커버 이미지 업로드 중...', 'info', 0);

    try {
      const bundle = await createUploadBundle(file, mediaBaseUrl);
      coverInput.value = bundle.mediaUrl;
      queuePreviewRefresh();
      showFeedback('커버 이미지 업로드 완료.', 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : '커버 이미지 업로드 중 오류가 발생했습니다.';
      showFeedback(message, 'error');
    } finally {
      isUploading = false;
    }
  };

  titleInput.addEventListener('input', () => {
    if (!slugInput.dataset.touched || slugInput.value.trim().length === 0) {
      slugInput.value = slugify(titleInput.value);
      queueSlugAvailabilityCheck();
    }
    queuePreviewRefresh();
  });

  slugInput.addEventListener('input', () => {
    slugInput.dataset.touched = 'true';
    queueSlugAvailabilityCheck();
    queuePreviewRefresh();
  });

  excerptInput.addEventListener('input', queuePreviewRefresh);
  coverInput.addEventListener('input', queuePreviewRefresh);
  coverInput.addEventListener('blur', () => {
    normalizeCoverInputValue(true);
    queuePreviewRefresh();
  });

  const unobserveEditor = editorBridge.observeChanges(queuePreviewRefresh);
  setDraftLayerOpen(false);
  setPublishLayerOpen(false);

  openDraftsButton.addEventListener('click', async () => {
    setPublishLayerOpen(false);
    setDraftLayerOpen(true);
    await loadDraftList();
  });

  closeDraftsButton.addEventListener('click', () => {
    setDraftLayerOpen(false);
  });

  draftBackdrop.addEventListener('click', () => {
    setDraftLayerOpen(false);
  });

  draftList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains('writer-draft-title')) {
      const slug = target.dataset.slug?.trim();
      if (!slug) return;
      const loaded = await loadDraftBySlug(slug, { updateQuery: true, showToast: true });
      if (loaded) {
        setDraftLayerOpen(false);
      }
      return;
    }

    if (target.classList.contains('writer-draft-delete') && target instanceof HTMLButtonElement) {
      const slug = target.dataset.slug?.trim();
      if (!slug) return;

      target.disabled = true;
      try {
        const response = await fetch(`/internal-api/posts/${encodeURIComponent(slug)}?status=draft`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          setDraftFeedback('임시저장 글 삭제에 실패했습니다.', 'error');
          target.disabled = false;
          return;
        }

        if (editingPostSlug === slug) {
          editingPostSlug = null;
          updateDraftQueryParam(null);
        }
        setDraftFeedback('임시저장 글을 삭제했습니다.', 'ok');
        await loadDraftList();
      } catch {
        setDraftFeedback('네트워크 오류로 삭제하지 못했습니다.', 'error');
        target.disabled = false;
      }
    }
  });

  uploadTrigger.addEventListener('click', () => {
    uploadInput.click();
  });

  openPublishButton.addEventListener('click', () => {
    setDraftLayerOpen(false);
    setPublishLayerOpen(true);
    queueSlugAvailabilityCheck();
  });

  closePublishButton.addEventListener('click', () => {
    setPublishLayerOpen(false);
  });

  publishBackdrop.addEventListener('click', () => {
    setPublishLayerOpen(false);
  });

  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (isDraftLayerOpen()) {
      event.preventDefault();
      setDraftLayerOpen(false);
      return;
    }
    if (!isPublishLayerOpen()) return;
    event.preventDefault();
    setPublishLayerOpen(false);
  };

  window.addEventListener('keydown', onWindowKeyDown);

  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    await uploadOneFileToBody(file);
  });

  editorRoot.addEventListener('dragover', (event) => {
    event.preventDefault();
    setDropTargetState('body');
  });

  editorRoot.addEventListener('drop', async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToBody(file);
    } finally {
      clearDropTargetState();
    }
  });

  editorRoot.addEventListener('paste', async (event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (!file) return;
    event.preventDefault();
    await uploadOneFileToBody(file);
  });

  coverDropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    setDropTargetState('cover');
  });

  coverDropZone.addEventListener('drop', async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      clearDropTargetState();
    }
  });

  coverPreview.addEventListener('click', () => {
    if (isUploading) return;
    coverUploadInput.click();
  });

  coverPreview.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetState('cover');
  });

  coverPreview.addEventListener('drop', async (event) => {
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

  coverUploadInput.addEventListener('change', async () => {
    const file = coverUploadInput.files?.[0];
    if (!file) return;
    try {
      await uploadOneFileToCover(file);
    } finally {
      coverUploadInput.value = '';
    }
  });

  coverInput.addEventListener('paste', async (event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (file) {
      event.preventDefault();
      await uploadOneFileToCover(file);
      return;
    }

    const pastedText = event.clipboardData?.getData('text/plain')?.trim() ?? '';
    if (!pastedText) return;

    event.preventDefault();
    coverInput.value = pastedText;
    normalizeCoverInputValue(true);
    queuePreviewRefresh();
  });

  const isMediaFileDrag = (event: DragEvent) => {
    const items = event.dataTransfer?.items;
    if (items && items.length > 0) {
      return Array.from(items).some((item) => {
        if (item.kind !== 'file') return false;
        const mime = item.type.toLowerCase();
        if (!mime) return true;
        return mime.startsWith('image/') || mime.startsWith('video/');
      });
    }

    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
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
      event.dataTransfer.dropEffect = 'copy';
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
    if (dropTarget === 'cover') {
      await uploadOneFileToCover(file);
      return;
    }
    await uploadOneFileToBody(file);
  };

  window.addEventListener('dragenter', onWindowDragEnter);
  window.addEventListener('dragover', onWindowDragOver);
  window.addEventListener('dragleave', onWindowDragLeave);
  window.addEventListener('drop', onWindowDrop);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    const desiredStatus = submitter?.getAttribute('data-submit-status');
    if (desiredStatus === 'draft' || desiredStatus === 'published') {
      statusInput.value = desiredStatus;
    }
    if (desiredStatus === 'draft') {
      setPublishLayerOpen(false);
    }

    const slug = slugInput.value.trim();
    const title = titleInput.value.trim();
    const status = statusInput.value as PostStatus;
    const bodyMarkdown = normalizeMarkdownLinks(
      sanitizeEditorMarkdown((await editorBridge.getMarkdown()).trim()),
      window.location.protocol,
    );
    normalizeCoverInputValue(false);

    if (!slug || !title || !bodyMarkdown) {
      showFeedback('slug, title, body는 필수입니다.', 'error');
      return;
    }

    const hasDuplicateSlug = await validateSlugAvailability('submit');
    if (hasDuplicateSlug) {
      if (desiredStatus === 'published' && !isPublishLayerOpen()) {
        setPublishLayerOpen(true);
      }
      slugInput.focus();
      return;
    }

    const payload = {
      slug,
      title,
      excerpt: excerptInput.value.trim() || null,
      body_markdown: bodyMarkdown,
      cover_image_url: coverInput.value.trim() || null,
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
    };
    const submitPath = editingPostSlug
      ? `/internal-api/posts/${encodeURIComponent(editingPostSlug)}`
      : '/internal-api/posts';
    const submitMethod = editingPostSlug ? 'PUT' : 'POST';

    showFeedback('게시글 저장 중...', 'info', 0);
    openPublishButton.disabled = true;
    confirmPublishButton.disabled = true;

    try {
      const response = await fetch(submitPath, {
        method: submitMethod,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as unknown;
        if (response.status === 409 && isSlugAlreadyExistsError(errorPayload)) {
          let suggestedSlug: string | null = null;
          try {
            suggestedSlug = await suggestAvailableSlug(slug);
          } catch {
            suggestedSlug = null;
          }

          if (desiredStatus === 'published' && !isPublishLayerOpen()) {
            setPublishLayerOpen(true);
          }

          if (suggestedSlug && suggestedSlug !== slug) {
            setSlugValidationState('error', `이미 사용 중인 주소입니다. 예: ${suggestedSlug}`);
          } else {
            setSlugValidationState('error', '이미 사용 중인 주소입니다. 다른 Post URL을 입력해 주세요.');
          }

          slugInput.focus();
          return;
        }
        throw new Error(normalizeJsonError(errorPayload));
      }

      const created = (await response.json()) as { slug: string; status: string };
      if (created.slug) {
        slugInput.value = created.slug;
        editingPostSlug = created.slug;
        setSlugValidationState('idle');
        queuePreviewRefresh();
      }
      const createdStatus = (created.status ?? status).toLowerCase();
      const publicPath = createdStatus === 'published' ? `/blog/${created.slug}/` : '/blog/';
      if (createdStatus === 'published') {
        setPublishLayerOpen(false);
        updateDraftQueryParam(null);
        window.location.assign(publicPath);
        return;
      }
      updateDraftQueryParam(created.slug);
      showFeedback('임시저장 완료', 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      showFeedback(message, 'error');
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
    window.removeEventListener('keydown', onWindowKeyDown);
    window.removeEventListener('dragenter', onWindowDragEnter);
    window.removeEventListener('dragover', onWindowDragOver);
    window.removeEventListener('dragleave', onWindowDragLeave);
    window.removeEventListener('drop', onWindowDrop);
    setDraftLayerOpen(false);
    setPublishLayerOpen(false);
    clearDropTargetState();
  };

  window.addEventListener('beforeunload', teardown, { once: true });
  window.addEventListener('pagehide', teardown, { once: true });

  await loadDraftFromQuery();
  await refreshPreview();
}
