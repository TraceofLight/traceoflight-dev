import type { APIRoute } from 'astro';

import { requestBackend } from '../../../lib/backend-api';

export const prerender = false;

function backendUnavailableResponse(): Response {
  return new Response(JSON.stringify({ message: 'backend unavailable' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });
}

function isNoBodyStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

function createProxiedResponse(response: Response, body: string): Response {
  const contentType = response.headers.get('content-type');
  const headers = contentType ? { 'content-type': contentType } : undefined;
  if (isNoBodyStatus(response.status)) {
    return new Response(null, {
      status: response.status,
      headers,
    });
  }

  return new Response(body, {
    status: response.status,
    headers,
  });
}

async function proxyDeletePostBySlug(slug: string, query: string): Promise<Response> {
  let response: Response;
  try {
    response = await requestBackend(`/posts/${slug}${query}`, {
      method: 'DELETE',
    });
  } catch {
    return backendUnavailableResponse();
  }
  const responseBody = await response.text();
  return createProxiedResponse(response, responseBody);
}

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ message: 'slug is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const query = url.search ? url.search : '';
  let response: Response;
  try {
    response = await requestBackend(`/posts/${slug}${query}`);
  } catch {
    return backendUnavailableResponse();
  }
  const body = await response.text();

  return createProxiedResponse(response, body);
};

export const PUT: APIRoute = async ({ params, request, url }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ message: 'slug is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = await request.text();
  const query = url.search ? url.search : '';
  let response: Response;
  try {
    response = await requestBackend(`/posts/${slug}${query}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch {
    return backendUnavailableResponse();
  }
  const responseBody = await response.text();

  return createProxiedResponse(response, responseBody);
};

export const DELETE: APIRoute = async ({ params, url }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ message: 'slug is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const query = url.search ? url.search : '';
  return proxyDeletePostBySlug(slug, query);
};

export const POST: APIRoute = async ({ params, request, url }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ message: 'slug is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const bodyText = (await request.text()).trim();
  let action = '';
  if (bodyText.length > 0) {
    try {
      const parsed = JSON.parse(bodyText) as { action?: string };
      action = typeof parsed.action === 'string' ? parsed.action.trim().toLowerCase() : '';
    } catch {
      return new Response(JSON.stringify({ message: 'invalid request payload' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  if (action !== 'delete') {
    return new Response(JSON.stringify({ message: 'unsupported action' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const query = url.search ? url.search : '';
  return proxyDeletePostBySlug(slug, query);
};
