import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "@/lib/admin-auth";
import { buildBackendApiUrl, requestBackend } from "@/lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
} from "@/lib/server/proxy-helpers";

export const prerender = false;

function guestBackendRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildBackendApiUrl(path), {
    ...init,
    cache: init?.cache ?? "no-store",
  });
}

async function isAdminSession(
  cookies: { get: (name: string) => { value: string } | undefined },
): Promise<boolean> {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  return Boolean(accessToken) && (await verifyAccessToken(accessToken));
}

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const commentId = params.id;
  if (!commentId) {
    return new Response(JSON.stringify({ detail: "id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await request.text();
  let response: Response;
  try {
    response = (await isAdminSession(cookies))
      ? await requestBackend(`/comments/${commentId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body,
        })
      : await guestBackendRequest(`/comments/${commentId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body,
        });
  } catch {
    return backendUnavailableResponse();
  }

  return proxyTextResponse(response);
};

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  const commentId = params.id;
  if (!commentId) {
    return new Response(JSON.stringify({ detail: "id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await request.text();
  let response: Response;
  try {
    response = (await isAdminSession(cookies))
      ? await requestBackend(`/comments/${commentId}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body,
        })
      : await guestBackendRequest(`/comments/${commentId}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body,
        });
  } catch {
    return backendUnavailableResponse();
  }

  return proxyTextResponse(response);
};
