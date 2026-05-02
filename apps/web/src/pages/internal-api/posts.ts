import type { APIRoute } from "astro";

import { requestBackend } from "../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
} from "../../lib/server/proxy-helpers";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/posts${query}`);
  } catch {
    return backendUnavailableResponse();
  }
  return proxyTextResponse(response);
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  let response: Response;
  try {
    response = await requestBackend("/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    return backendUnavailableResponse();
  }
  return proxyTextResponse(response);
};
