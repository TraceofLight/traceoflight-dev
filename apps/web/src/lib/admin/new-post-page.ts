import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';
import { replaceAll } from '@milkdown/utils';
import MarkdownIt from 'markdown-it';

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

interface EditorBridge {
  mode: 'crepe' | 'fallback';
  initError?: string;
  getMarkdown: () => Promise<string>;
  setMarkdown: (markdown: string) => Promise<void>;
  observeChanges: (onChange: () => void) => () => void;
}

const markdownPreview = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

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

function setFeedback(target: HTMLElement, message: string, type: 'error' | 'ok' | 'info'): void {
  target.textContent = message;
  target.dataset.state = type;
}

function normalizeJsonError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'request failed';
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  return 'request failed';
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

function normalizeEscapedMarkdownLinks(markdown: string): string {
  return markdown.replace(/\\(!?\[(?:\\.|[^\]])*\\?\])\\?\(([\s\S]*?)\\?\)/g, (full, rawLabel, rawUrl) => {
    const compactUrl = rawUrl.replace(/\s+/g, '');
    if (!/^https?:\/\//i.test(compactUrl)) return full;
    const label = rawLabel.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    return `${label}(${compactUrl})`;
  });
}

function normalizeMarkdownLinks(markdown: string, pageProtocol: string): string {
  const normalizedEscaped = normalizeEscapedMarkdownLinks(markdown);
  return normalizedEscaped.replace(/(!?\[[^\]]*]\()([\s\S]*?)(\))/g, (full, prefix, rawUrl, suffix) => {
    const compactUrl = rawUrl.replace(/\s+/g, '');
    if (!/^https?:\/\//i.test(compactUrl)) return full;
    const normalized = normalizeCoverUrl(compactUrl, pageProtocol).value;
    return `${prefix}${normalized}${suffix}`;
  });
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

  const feedback = document.querySelector<HTMLElement>('#admin-feedback');
  const editorRoot = document.querySelector<HTMLElement>('#milkdown-editor');
  const titleInput = document.querySelector<HTMLInputElement>('#post-title');
  const slugInput = document.querySelector<HTMLInputElement>('#post-slug');
  const excerptInput = document.querySelector<HTMLTextAreaElement>('#post-excerpt');
  const coverInput = document.querySelector<HTMLInputElement>('#post-cover');
  const statusInput = document.querySelector<HTMLSelectElement>('#post-status');
  const previewTitle = document.querySelector<HTMLElement>('#writer-preview-title');
  const previewSlug = document.querySelector<HTMLElement>('#writer-preview-slug');
  const previewExcerpt = document.querySelector<HTMLElement>('#writer-preview-excerpt');
  const previewCover = document.querySelector<HTMLImageElement>('#writer-preview-cover');
  const previewContent = document.querySelector<HTMLElement>('#writer-preview-content');
  const uploadTrigger = document.querySelector<HTMLButtonElement>('#writer-upload-trigger');
  const uploadInput = document.querySelector<HTMLInputElement>('#writer-upload-input');
  const dropOverlay = document.querySelector<HTMLElement>('#writer-drop-overlay');

  if (
    !feedback ||
    !editorRoot ||
    !titleInput ||
    !slugInput ||
    !excerptInput ||
    !coverInput ||
    !statusInput ||
    !previewTitle ||
    !previewSlug ||
    !previewExcerpt ||
    !previewCover ||
    !previewContent ||
    !uploadTrigger ||
    !uploadInput
  ) {
    return;
  }

  const mediaBaseUrl = normalizeMediaBaseUrl(form.dataset.mediaBaseUrl ?? '', window.location.origin);
  const editorBridge = await createEditorBridge(editorRoot, '# Lorem ipsum heading\n\nWrite your story here.\n');
  if (editorBridge.mode === 'fallback') {
    setFeedback(
      feedback,
      `Editor initialization failed, switched to fallback textarea: ${editorBridge.initError ?? 'unknown'}`,
      'error',
    );
  }

  let isUploading = false;
  let previewJobQueued = false;
  let dragDepth = 0;

  const showDropOverlay = () => {
    if (!dropOverlay) return;
    dropOverlay.hidden = false;
    dropOverlay.setAttribute('aria-hidden', 'false');
  };

  const hideDropOverlay = () => {
    if (!dropOverlay) return;
    dropOverlay.hidden = true;
    dropOverlay.setAttribute('aria-hidden', 'true');
  };

  const normalizeCoverInputValue = (withMessage: boolean) => {
    const normalized = normalizeCoverUrl(coverInput.value, window.location.protocol);
    const changed = normalized.value !== coverInput.value.trim();
    if (changed) {
      coverInput.value = normalized.value;
    }
    if (withMessage && normalized.message) {
      setFeedback(feedback, normalized.message, 'info');
    }
    return normalized.value;
  };

  const refreshPreview = async () => {
    const markdown = await editorBridge.getMarkdown();
    const normalizedMarkdown = normalizeMarkdownLinks(markdown, window.location.protocol);
    previewContent.innerHTML = markdownPreview.render(normalizedMarkdown);

    const nextTitle = titleInput.value.trim() || 'Lorem ipsum title';
    const nextSlug = slugInput.value.trim() || 'lorem-ipsum-title';
    const nextExcerpt =
      excerptInput.value.trim() || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
    const nextCover = normalizeCoverInputValue(false);

    previewTitle.textContent = nextTitle;
    previewSlug.textContent = `/blog/${nextSlug}`;
    previewExcerpt.textContent = nextExcerpt;

    if (nextCover) {
      previewCover.hidden = false;
      previewCover.src = nextCover;
      previewCover.alt = `${nextTitle} cover`;
    } else {
      previewCover.hidden = true;
      previewCover.removeAttribute('src');
      previewCover.alt = 'Cover preview';
    }
  };

  const queuePreviewRefresh = () => {
    if (previewJobQueued) return;
    previewJobQueued = true;
    window.requestAnimationFrame(async () => {
      previewJobQueued = false;
      await refreshPreview();
    });
  };

  const insertSnippet = async (snippet: string) => {
    const currentMarkdown = await editorBridge.getMarkdown();
    await editorBridge.setMarkdown(`${currentMarkdown.trimEnd()}\n\n${snippet}\n`);
    queuePreviewRefresh();
  };

  const uploadOneFileToBody = async (file: File) => {
    if (isUploading) {
      setFeedback(feedback, '이미 업로드를 처리 중입니다. 잠시만 기다려 주세요.', 'info');
      return;
    }

    isUploading = true;
    setFeedback(feedback, '미디어 업로드 중...', 'info');
    uploadTrigger.disabled = true;

    try {
      const bundle = await createUploadBundle(file, mediaBaseUrl);
      await insertSnippet(bundle.snippet);
      setFeedback(feedback, '업로드 완료, 본문에 삽입했습니다.', 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : '미디어 업로드 중 오류가 발생했습니다.';
      setFeedback(feedback, message, 'error');
    } finally {
      isUploading = false;
      uploadTrigger.disabled = false;
      uploadInput.value = '';
    }
  };

  const uploadOneFileToCover = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setFeedback(feedback, '커버 이미지는 이미지 파일만 지원합니다.', 'error');
      return;
    }

    if (isUploading) {
      setFeedback(feedback, '이미 업로드를 처리 중입니다. 잠시만 기다려 주세요.', 'info');
      return;
    }

    isUploading = true;
    setFeedback(feedback, '커버 이미지 업로드 중...', 'info');

    try {
      const bundle = await createUploadBundle(file, mediaBaseUrl);
      coverInput.value = bundle.mediaUrl;
      queuePreviewRefresh();
      setFeedback(feedback, '커버 이미지 업로드 완료.', 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : '커버 이미지 업로드 중 오류가 발생했습니다.';
      setFeedback(feedback, message, 'error');
    } finally {
      isUploading = false;
    }
  };

  titleInput.addEventListener('input', () => {
    if (!slugInput.dataset.touched || slugInput.value.trim().length === 0) {
      slugInput.value = slugify(titleInput.value);
    }
    queuePreviewRefresh();
  });

  slugInput.addEventListener('input', () => {
    slugInput.dataset.touched = 'true';
    queuePreviewRefresh();
  });

  excerptInput.addEventListener('input', queuePreviewRefresh);
  coverInput.addEventListener('input', queuePreviewRefresh);
  coverInput.addEventListener('blur', () => {
    normalizeCoverInputValue(true);
    queuePreviewRefresh();
  });

  previewCover.addEventListener('error', () => {
    previewCover.hidden = true;
    previewCover.removeAttribute('src');
    previewCover.alt = 'Cover preview';
    setFeedback(
      feedback,
      'Cover image could not be loaded. Use a direct HTTPS image URL or upload an image file.',
      'error',
    );
  });

  const unobserveEditor = editorBridge.observeChanges(queuePreviewRefresh);

  uploadTrigger.addEventListener('click', () => {
    uploadInput.click();
  });

  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    await uploadOneFileToBody(file);
  });

  editorRoot.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  editorRoot.addEventListener('drop', async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await uploadOneFileToBody(file);
  });

  editorRoot.addEventListener('paste', async (event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (!file) return;
    event.preventDefault();
    await uploadOneFileToBody(file);
  });

  coverInput.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  coverInput.addEventListener('drop', async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await uploadOneFileToCover(file);
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
    showDropOverlay();
  };

  const onWindowDragOver = (event: DragEvent) => {
    if (!isMediaFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    showDropOverlay();
  };

  const onWindowDragLeave = (event: DragEvent) => {
    if (!isMediaFileDrag(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      hideDropOverlay();
    }
  };

  const onWindowDrop = async (event: DragEvent) => {
    if (!isMediaFileDrag(event)) return;
    const alreadyHandled = event.defaultPrevented;
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    dragDepth = 0;
    hideDropOverlay();
    if (!file || alreadyHandled) return;
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

    const slug = slugInput.value.trim();
    const title = titleInput.value.trim();
    const status = statusInput.value as PostStatus;
    const bodyMarkdown = normalizeMarkdownLinks(
      (await editorBridge.getMarkdown()).trim(),
      window.location.protocol,
    );
    normalizeCoverInputValue(false);

    if (!slug || !title || !bodyMarkdown) {
      setFeedback(feedback, 'slug, title, body는 필수입니다.', 'error');
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

    setFeedback(feedback, '게시글 저장 중...', 'info');

    try {
      const response = await fetch('/internal-api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as unknown;
        throw new Error(normalizeJsonError(errorPayload));
      }

      const created = (await response.json()) as { slug: string; status: string };
      if (created.slug) {
        slugInput.value = created.slug;
        queuePreviewRefresh();
      }
      const publicPath = created.status === 'published' ? `/blog/${created.slug}/` : '/blog/';
      setFeedback(feedback, `저장 완료: ${publicPath}`, 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      setFeedback(feedback, message, 'error');
    }
  });

  const teardown = () => {
    unobserveEditor();
    window.removeEventListener('dragenter', onWindowDragEnter);
    window.removeEventListener('dragover', onWindowDragOver);
    window.removeEventListener('dragleave', onWindowDragLeave);
    window.removeEventListener('drop', onWindowDrop);
    hideDropOverlay();
  };

  window.addEventListener('beforeunload', teardown, { once: true });
  window.addEventListener('pagehide', teardown, { once: true });

  await refreshPreview();
}
