import type { APIRoute } from "astro";

import { requestBackend } from "../../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
} from "../../../../lib/server/proxy-helpers";

export const prerender = false;

const TARGET_LOCALES = new Set(["en", "ja", "zh"]);

function jsonError(detail: string, status = 400): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) {
    return jsonError("slug is required");
  }

  const bodyText = (await request.text()).trim();
  if (!bodyText) {
    return jsonError("locale is required");
  }

  let locale = "";
  try {
    const parsed = JSON.parse(bodyText) as { locale?: unknown };
    locale = typeof parsed.locale === "string" ? parsed.locale.trim() : "";
  } catch {
    return jsonError("invalid request payload");
  }

  if (!locale) {
    return jsonError("locale is required");
  }
  if (locale === "ko") {
    return jsonError("source posts cannot be retranslated", 403);
  }
  if (!TARGET_LOCALES.has(locale)) {
    return jsonError("unsupported locale");
  }

  let response: Response;
  try {
    response = await requestBackend(`/posts/${slug}/retranslate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale }),
    });
  } catch {
    return backendUnavailableResponse();
  }
  return proxyTextResponse(response);
};
