import type { APIRoute } from "astro";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { SITE_URL } from "../../../consts";
import { getBackendApiBaseUrl } from "../../../lib/backend-api";

export const prerender = false;

const MODULE_ROOT = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const APP_ROOT_CANDIDATES = [MODULE_ROOT, path.dirname(MODULE_ROOT)];
const MAX_IMAGE_WIDTH = 2200;
const MAX_IMAGE_HEIGHT = 2200;
const DEFAULT_QUALITY = 82;
const DEFAULT_BACKGROUND = { r: 248, g: 250, b: 252, alpha: 1 };

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

function buildSourceUrlCandidates(request: Request, source: string): URL[] {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    return [];
  }

  const requestOrigin = new URL(request.url).origin;
  const isRelativeSource = trimmedSource.startsWith("/");
  if (!isRelativeSource) {
    const resolvedUrl = new URL(trimmedSource);

    if (!["http:", "https:"].includes(resolvedUrl.protocol)) {
      return [];
    }

    if (isBlockedHostname(resolvedUrl.hostname)) {
      return [];
    }

    return [resolvedUrl];
  }

  const configuredSiteOrigin = process.env.SITE_URL?.trim() || SITE_URL;
  const backendAssetOrigin = (() => {
    try {
      return new URL(getBackendApiBaseUrl()).origin;
    } catch {
      return "";
    }
  })();
  const originCandidates = trimmedSource.startsWith("/media/")
    ? [requestOrigin, backendAssetOrigin, configuredSiteOrigin]
    : [requestOrigin];
  const uniqueOrigins = [...new Set(originCandidates.map((origin) => origin.trim()).filter(Boolean))];
  const resolvedCandidates: URL[] = [];

  for (const origin of uniqueOrigins) {
    try {
      const resolvedUrl = new URL(trimmedSource, origin);
      if (!["http:", "https:"].includes(resolvedUrl.protocol)) {
        continue;
      }
      resolvedCandidates.push(resolvedUrl);
    } catch {
      continue;
    }
  }

  return resolvedCandidates;
}

function toRelativeAssetPath(source: string): string | null {
  const normalizedSource = path.posix.normalize(source.trim());
  if (!normalizedSource.startsWith("/")) {
    return null;
  }

  const relativePath = normalizedSource.slice(1);
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes("/../")) {
    return null;
  }

  return relativePath;
}

async function loadRelativeAssetBuffer(source: string): Promise<Buffer | null> {
  const relativeAssetPath = toRelativeAssetPath(source);
  if (!relativeAssetPath) {
    return null;
  }

  for (const appRoot of APP_ROOT_CANDIDATES) {
    const candidatePaths = [
      path.join(appRoot, "public", relativeAssetPath),
      path.join(appRoot, "dist", "client", relativeAssetPath),
    ];

    for (const candidatePath of candidatePaths) {
      try {
        await access(candidatePath);
        return await readFile(candidatePath);
      } catch {
        continue;
      }
    }
  }

  return null;
}

export const GET: APIRoute = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const sourceParam = requestUrl.searchParams.get("url");
  const sourceCandidates = sourceParam ? buildSourceUrlCandidates(request, sourceParam) : [];

  if (sourceCandidates.length === 0) {
    return badRequest("A valid image url is required.");
  }

  const width = clampInteger(requestUrl.searchParams.get("w"), 1200, MAX_IMAGE_WIDTH);
  const height = clampInteger(requestUrl.searchParams.get("h"), 900, MAX_IMAGE_HEIGHT);
  const quality = clampInteger(requestUrl.searchParams.get("q"), DEFAULT_QUALITY, 100);
  const fit = requestUrl.searchParams.get("fit");
  const resizeFit = fit === "contain" || fit === "inside" ? fit : "cover";
  const relativeAssetBuffer = sourceParam && sourceParam.trim().startsWith("/")
    ? await loadRelativeAssetBuffer(sourceParam)
    : null;

  let upstreamResponse: Response | null = null;
  if (!relativeAssetBuffer) {
    for (const sourceUrl of sourceCandidates) {
      try {
        const candidateResponse = await fetch(sourceUrl, {
          headers: {
            accept: "image/avif,image/webp,image/*;q=0.8,*/*;q=0.1",
          },
        });

        if (!candidateResponse.ok) {
          continue;
        }

        const sourceContentType = candidateResponse.headers.get("content-type") ?? "";
        if (!sourceContentType.startsWith("image/")) {
          continue;
        }

        upstreamResponse = candidateResponse;
        break;
      } catch {
        continue;
      }
    }

    if (!upstreamResponse) {
      return badRequest("Failed to fetch source image.", 502);
    }
  }

  const arrayBuffer = relativeAssetBuffer
    ?? Buffer.from(await upstreamResponse!.arrayBuffer());
  let imagePipeline = sharp(Buffer.from(arrayBuffer));
  const metadata = await imagePipeline.metadata();

  imagePipeline = imagePipeline.resize({
    width,
    height,
    fit: resizeFit,
    position: "centre",
    background: resizeFit === "cover" ? undefined : DEFAULT_BACKGROUND,
  });

  if (metadata.hasAlpha || resizeFit !== "cover") {
    imagePipeline = imagePipeline.flatten({
      background: DEFAULT_BACKGROUND,
    });
  }

  const transformed = await imagePipeline
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
