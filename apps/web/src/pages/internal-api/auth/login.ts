import type { APIRoute } from "astro";

import {
  clearAdminAuthCookies,
  isAdminAuthConfigured,
  setAdminAuthCookies,
  verifyOperationalAdminCredentials,
} from "../../../lib/admin-auth";
import { serverLogger } from "../../../lib/server/logging";

export const prerender = false;

interface LoginRequest {
  username?: string;
  password?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdminAuthConfigured()) {
    serverLogger.warn("admin.auth_not_configured");
    return new Response(
      JSON.stringify({ detail: "Admin auth is not configured" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }

  let payload: LoginRequest = {};
  try {
    payload = (await request.json()) as LoginRequest;
  } catch {
    serverLogger.warn("admin.login_invalid_json");
    return new Response(JSON.stringify({ detail: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const username = payload.username?.trim() ?? "";
  const password = payload.password ?? "";
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const clientIp =
    (xff.split(",")[0] ?? "").trim() ||
    (request.headers.get("x-real-ip") ?? "").trim();
  serverLogger.debug("admin.login_requested", {
    username_present: Boolean(username),
    username_length: username.length,
    has_client_ip: Boolean(clientIp),
  });
  const verification = await verifyOperationalAdminCredentials(
    username,
    password,
    clientIp,
  );
  if (!verification.ok || !verification.tokenPair) {
    if (verification.throttled) {
      serverLogger.warn("admin.login_throttled", {
        has_client_ip: Boolean(clientIp),
        retry_after_seconds: verification.retryAfterSeconds,
      });
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (verification.retryAfterSeconds) {
        headers["retry-after"] = String(verification.retryAfterSeconds);
      }
      return new Response(
        JSON.stringify({
          detail: "Too many failed attempts. Try again later.",
        }),
        { status: 429, headers },
      );
    }
    serverLogger.warn("admin.login_failed", {
      has_client_ip: Boolean(clientIp),
    });
    return new Response(
      JSON.stringify({ detail: "Invalid username or password" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const secure =
    process.env.NODE_ENV === "production" || request.url.startsWith("https://");
  clearAdminAuthCookies(cookies);
  setAdminAuthCookies(cookies, verification.tokenPair, secure);
  serverLogger.info("admin.login_succeeded", {
    credential_source: verification.credentialSource ?? "unknown",
    credential_revision: verification.credentialRevision,
    has_client_ip: Boolean(clientIp),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
