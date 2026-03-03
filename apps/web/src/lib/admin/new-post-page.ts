import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';
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

const markdownPreview = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

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

async function getEditorMarkdown(editor: Crepe): Promise<string> {
  const markdown = editor.getMarkdown();
  if (typeof markdown === 'string') return markdown;
  return await markdown;
}

async function setEditorMarkdown(editor: Crepe, markdown: string): Promise<void> {
  await editor.setMarkdown(markdown);
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
  const uploadResult = await fetch(uploadInfo.upload_url, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!uploadResult.ok) {
    throw new Error('failed to upload file to object storage');
  }

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
  const previewExcerpt = document.querySelector<HTMLElement>('#writer-preview-excerpt');
  const previewContent = document.querySelector<HTMLElement>('#writer-preview-content');
  const uploadTrigger = document.querySelector<HTMLButtonElement>('#writer-upload-trigger');
  const uploadInput = document.querySelector<HTMLInputElement>('#writer-upload-input');

  if (
    !feedback ||
    !editorRoot ||
    !titleInput ||
    !slugInput ||
    !excerptInput ||
    !coverInput ||
    !statusInput ||
    !previewTitle ||
    !previewExcerpt ||
    !previewContent ||
    !uploadTrigger ||
    !uploadInput
  ) {
    return;
  }

  const mediaBaseUrl = normalizeMediaBaseUrl(form.dataset.mediaBaseUrl ?? '', window.location.origin);

  const editor = new Crepe({
    root: editorRoot,
    defaultValue: '# Lorem ipsum heading\n\nWrite your story here.\n',
  });
  await editor.create();

  let isUploading = false;
  let previewJobQueued = false;

  const refreshPreview = async () => {
    const markdown = await getEditorMarkdown(editor);
    previewContent.innerHTML = markdownPreview.render(markdown);
    previewTitle.textContent = titleInput.value.trim() || 'Lorem ipsum title';
    previewExcerpt.textContent =
      excerptInput.value.trim() || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
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
    const currentMarkdown = await getEditorMarkdown(editor);
    await setEditorMarkdown(editor, `${currentMarkdown.trimEnd()}\n\n${snippet}\n`);
    queuePreviewRefresh();
  };

  const uploadOneFile = async (file: File) => {
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

  titleInput.addEventListener('input', () => {
    if (!slugInput.dataset.touched || slugInput.value.trim().length === 0) {
      slugInput.value = slugify(titleInput.value);
    }
    queuePreviewRefresh();
  });

  slugInput.addEventListener('input', () => {
    slugInput.dataset.touched = 'true';
  });

  excerptInput.addEventListener('input', queuePreviewRefresh);
  editorRoot.addEventListener('input', queuePreviewRefresh);
  editorRoot.addEventListener('keyup', queuePreviewRefresh);

  const observer = new MutationObserver(() => {
    queuePreviewRefresh();
  });
  observer.observe(editorRoot, { childList: true, subtree: true, characterData: true });

  uploadTrigger.addEventListener('click', () => {
    uploadInput.click();
  });

  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    await uploadOneFile(file);
  });

  editorRoot.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  editorRoot.addEventListener('drop', async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await uploadOneFile(file);
  });

  editorRoot.addEventListener('paste', async (event) => {
    const file = extractFileFromClipboard(event as ClipboardEvent);
    if (!file) return;
    event.preventDefault();
    await uploadOneFile(file);
  });

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
    const bodyMarkdown = (await getEditorMarkdown(editor)).trim();

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
      if (created.slug) slugInput.value = created.slug;
      const publicPath = created.status === 'published' ? `/blog/${created.slug}/` : '/blog/';
      setFeedback(feedback, `저장 완료: ${publicPath}`, 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      setFeedback(feedback, message, 'error');
    }
  });

  await refreshPreview();
}
