import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';

type PostStatus = 'draft' | 'published';
type AssetKind = 'image' | 'video' | 'file';

interface UploadUrlResponse {
  object_key: string;
  bucket: string;
  upload_url: string;
  expires_in_seconds: number;
}

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
  const mediaFileInput = document.querySelector<HTMLInputElement>('#media-file');
  const mediaBaseUrlInput = document.querySelector<HTMLInputElement>('#media-base-url');
  const mediaUploadButton = document.querySelector<HTMLButtonElement>('#upload-media-button');

  if (
    !feedback ||
    !editorRoot ||
    !titleInput ||
    !slugInput ||
    !excerptInput ||
    !coverInput ||
    !statusInput ||
    !mediaFileInput ||
    !mediaBaseUrlInput ||
    !mediaUploadButton
  ) {
    return;
  }

  const editor = new Crepe({
    root: editorRoot,
    defaultValue: '## Lorem ipsum\n\n',
  });
  await editor.create();

  titleInput.addEventListener('input', () => {
    if (!slugInput.dataset.touched || slugInput.value.trim().length === 0) {
      slugInput.value = slugify(titleInput.value);
    }
  });

  slugInput.addEventListener('input', () => {
    slugInput.dataset.touched = 'true';
  });

  mediaUploadButton.addEventListener('click', async () => {
    const file = mediaFileInput.files?.[0];
    if (!file) {
      setFeedback(feedback, '업로드할 파일을 먼저 선택해 주세요.', 'error');
      return;
    }

    const mediaBaseUrl = mediaBaseUrlInput.value.trim();
    if (!mediaBaseUrl) {
      setFeedback(feedback, 'Media base URL을 입력해 주세요.', 'error');
      return;
    }

    const kind = resolveAssetKind(file.type);
    mediaUploadButton.disabled = true;
    setFeedback(feedback, '미디어 업로드 URL 생성 중...', 'info');

    try {
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
        headers: {
          'content-type': file.type || 'application/octet-stream',
        },
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
      const snippet = buildMarkdownSnippet(kind, file.name, mediaUrl);
      const currentMarkdown = await getEditorMarkdown(editor);
      await setEditorMarkdown(editor, `${currentMarkdown.trimEnd()}\n\n${snippet}\n`);

      setFeedback(feedback, '미디어 업로드 후 본문에 삽입했습니다.', 'ok');
      mediaFileInput.value = '';
    } catch (error) {
      const message = error instanceof Error ? error.message : '미디어 업로드 중 오류가 발생했습니다.';
      setFeedback(feedback, message, 'error');
    } finally {
      mediaUploadButton.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

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
      const publicPath = created.status === 'published' ? `/blog/${created.slug}/` : `/blog/`;
      setFeedback(feedback, `저장 완료: ${publicPath}`, 'ok');
      form.reset();
      await setEditorMarkdown(editor, '## Lorem ipsum\n\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      setFeedback(feedback, message, 'error');
    }
  });
}
