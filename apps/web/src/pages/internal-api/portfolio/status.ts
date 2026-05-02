import type { APIRoute } from "astro";

import { requestBackend } from "../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
} from "../../../lib/server/proxy-helpers";

export const prerender = false;

export const GET: APIRoute = async () => {
  let response: Response;
  try {
    response = await requestBackend("/portfolio/status", {
      method: "GET",
    });
  } catch {
    return backendUnavailableResponse();
  }

  return proxyTextResponse(response);
};
