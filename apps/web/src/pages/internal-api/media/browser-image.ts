import type { APIRoute } from "astro";
import sharp from "sharp";

export const prerender = false;

const MAX_IMAGE_WIDTH = 2200;
const MAX_IMAGE_HEIGHT = 2200;
const DEFAULT_QUALITY = 82;

function badRequest(detail: string, status = 400): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function clampInteger(value: string | null, fallback: number, max: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized.endsWith(".local")
  ) {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  if (/^192\.168\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  const private172Match = normalized.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (private172Match) {
    const secondOctet = Number.parseInt(private172Match[1] ?? "", 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function resolveSourceUrl(request: Request, source: string): URL | null {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    return null;
  }

  const requestOrigin = new URL(request.url).origin;
  const isRelativeSource = trimmedSource.startsWith("/");
  const resolvedUrl = isRelativeSource
    ? new URL(trimmedSource, requestOrigin)
    : new URL(trimmedSource);

  if (!["http:", "https:"].includes(resolvedUrl.protocol)) {
    return null;
  }

  if (!isRelativeSource && isBlockedHostname(resolvedUrl.hostname)) {
    return null;
  }

  return resolvedUrl;
}

export const GET: APIRoute = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const sourceParam = requestUrl.searchParams.get("url");
  const sourceUrl = sourceParam ? resolveSourceUrl(request, sourceParam) : null;

  if (!sourceUrl) {
    return badRequest("A valid image url is required.");
  }

  const width = clampInteger(requestUrl.searchParams.get("w"), 1200, MAX_IMAGE_WIDTH);
  const height = clampInteger(requestUrl.searchParams.get("h"), 900, MAX_IMAGE_HEIGHT);
  const quality = clampInteger(requestUrl.searchParams.get("q"), DEFAULT_QUALITY, 100);

  const upstreamResponse = await fetch(sourceUrl, {
    headers: {
      accept: "image/avif,image/webp,image/*;q=0.8,*/*;q=0.1",
    },
  });

  if (!upstreamResponse.ok) {
    return badRequest(`Failed to fetch source image: ${upstreamResponse.status}`, 502);
  }

  const sourceContentType = upstreamResponse.headers.get("content-type") ?? "";
  if (!sourceContentType.startsWith("image/")) {
    return badRequest("The requested asset is not an image.", 415);
  }

  const arrayBuffer = await upstreamResponse.arrayBuffer();
  const transformed = await sharp(Buffer.from(arrayBuffer))
    .resize({
      width,
      height,
      fit: "cover",
      withoutEnlargement: true,
    })
    .webp({
      quality,
    })
    .toBuffer();

  return new Response(new Uint8Array(transformed), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(transformed.byteLength),
    },
  });
};
