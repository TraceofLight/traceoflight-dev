import type { APIRoute } from "astro";

import { requestBackend } from "../../../lib/backend-api";
import {
  backendUnavailableImportsResponse,
  proxyTextResponse,
} from "../../../lib/server/imports-proxy";

export const prerender = false;

export const GET: APIRoute = async () => {
  let response: Response;
  try {
    response = await requestBackend("/portfolio/status", {
      method: "GET",
    });
  } catch {
    return backendUnavailableImportsResponse();
  }

  return proxyTextResponse(response);
};
