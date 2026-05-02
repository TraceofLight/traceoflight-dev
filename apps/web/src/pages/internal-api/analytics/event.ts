import type { APIRoute } from "astro";

export const prerender = false;

const CLIENT_ID_COOKIE = "traceoflight_cid";
const CLIENT_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years
const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;

interface IncomingEvent {
  name: string;
  params?: Record<string, unknown>;
}

function generateClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random suffix in GA4-compatible "1234567890.0987654321" form.
  const left = Math.floor(Date.now() / 1000);
  const right = Math.floor(Math.random() * 1_000_000_000);
  return `${left}.${right}`;
}

function readCleanString(value: unknown, max = 1024): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function sanitizeEventParams(raw: Record<string, unknown> | undefined): Record<string, string | number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "string") {
      const cleaned = readCleanString(value, 500);
      if (cleaned) out[key] = cleaned;
    }
    // booleans and other types are dropped on purpose; GA4 MP only accepts string/number.
  }
  return out;
}

function readEventName(value: unknown): string | undefined {
  const cleaned = readCleanString(value, 40);
  if (!cleaned) return undefined;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleaned)) return undefined;
  return cleaned;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const measurementId = (process.env.GA4_MEASUREMENT_ID ?? "").trim();
  const apiSecret = (process.env.GA4_API_SECRET ?? "").trim();

  if (!MEASUREMENT_ID_PATTERN.test(measurementId) || !apiSecret) {
    // Analytics is opt-in: missing config = silent no-op so dev/preview still works.
    return new Response(null, { status: 204 });
  }

  let payload: IncomingEvent | null = null;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      payload = body as IncomingEvent;
    }
  } catch {
    return new Response(null, { status: 204 });
  }

  const eventName = readEventName(payload?.name);
  if (!eventName) {
    return new Response(null, { status: 204 });
  }

  const eventParams = sanitizeEventParams(payload?.params);

  let clientId = cookies.get(CLIENT_ID_COOKIE)?.value;
  if (!clientId || clientId.length > 64) {
    clientId = generateClientId();
    cookies.set(CLIENT_ID_COOKIE, clientId, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: CLIENT_ID_MAX_AGE_SECONDS,
    });
  }

  const url = new URL(GA4_ENDPOINT);
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);

  // GA4 MP "fire and forget" — failures shouldn't surface to the visitor.
  void fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      events: [{ name: eventName, params: eventParams }],
    }),
    keepalive: true,
  }).catch(() => {
    // Ignore network errors; visitor experience is unaffected.
  });

  return new Response(null, { status: 204 });
};
