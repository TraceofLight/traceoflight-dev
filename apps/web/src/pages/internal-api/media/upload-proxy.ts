import type { APIRoute } from 'astro';

export const prerender = false;

function json(detail: string, status: number): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface ProxyUploadPayload {
  uploadUrl: string;
  contentType: string;
  body: BodyInit;
}

async function parseProxyUploadPayload(request: Request): Promise<ProxyUploadPayload | Response> {
  const requestContentType = request.headers.get('content-type') ?? '';
  const isMultipart = requestContentType.toLowerCase().includes('multipart/form-data');

  if (isMultipart) {
    const form = await request.formData();
    const uploadUrl = String(form.get('upload_url') ?? '').trim();
    const contentType = String(form.get('content_type') ?? 'application/octet-stream').trim();
    const file = form.get('file');

    if (!uploadUrl) {
      return json('upload_url is required', 400);
    }
    if (!(file instanceof File)) {
      return json('file is required', 400);
    }

    return {
      uploadUrl,
      contentType: contentType || file.type || 'application/octet-stream',
      body: file,
    };
  }

  const uploadUrl = String(request.headers.get('x-upload-url') ?? '').trim();
  const contentType = String(
    request.headers.get('x-upload-content-type') ??
      requestContentType ??
      'application/octet-stream',
  ).trim();
  const binaryBody = await request.arrayBuffer();

  if (!uploadUrl) {
    return json('x-upload-url header is required', 400);
  }
  if (binaryBody.byteLength === 0) {
    return json('request body is empty', 400);
  }

  return {
    uploadUrl,
    contentType: contentType || 'application/octet-stream',
    body: binaryBody,
  };
}

export const POST: APIRoute = async ({ request }) => {
  const payload = await parseProxyUploadPayload(request);
  if (payload instanceof Response) {
    return payload;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(payload.uploadUrl);
  } catch {
    return json('upload_url is invalid', 400);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return json('upload_url protocol is not supported', 400);
  }

  const uploadResponse = await fetch(parsedUrl.toString(), {
    method: 'PUT',
    headers: {
      'content-type': payload.contentType || 'application/octet-stream',
    },
    body: payload.body,
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
