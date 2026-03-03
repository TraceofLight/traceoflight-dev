import type { APIRoute } from 'astro';

export const prerender = false;

function json(detail: string, status: number): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const uploadUrl = String(form.get('upload_url') ?? '').trim();
  const contentType = String(form.get('content_type') ?? 'application/octet-stream');
  const file = form.get('file');

  if (!uploadUrl) {
    return json('upload_url is required', 400);
  }
  if (!(file instanceof File)) {
    return json('file is required', 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(uploadUrl);
  } catch {
    return json('upload_url is invalid', 400);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return json('upload_url protocol is not supported', 400);
  }

  const uploadResponse = await fetch(parsedUrl.toString(), {
    method: 'PUT',
    headers: {
      'content-type': contentType || file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const backendMessage = await uploadResponse.text().catch(() => '');
    return json(
      backendMessage || `object storage upload failed with status ${uploadResponse.status}`,
      502,
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
