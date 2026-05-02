import type { ImageMetadata } from "astro";

export type CoverMediaSource = ImageMetadata | string | null | undefined;

export type CoverMedia =
  | {
      kind: "optimized";
      src: ImageMetadata;
    }
  | {
      kind: "native";
      src: string;
    };

export function normalizeOptionalImageUrl(source: string | null | undefined): string | undefined {
  if (typeof source !== "string") {
    return undefined;
  }

  const normalizedSource = source.trim();
  return normalizedSource.length > 0 ? normalizedSource : undefined;
}

export function normalizeCoverMedia(source: CoverMediaSource): CoverMedia | undefined {
  if (!source) {
    return undefined;
  }

  if (typeof source === "string") {
    const normalizedSource = normalizeOptionalImageUrl(source);
    if (!normalizedSource) {
      return undefined;
    }

    return {
      kind: "native",
      src: normalizedSource,
    };
  }

  return {
    kind: "optimized",
    src: source,
  };
}

export function getCoverMediaMetadata(media: CoverMedia | undefined): ImageMetadata | undefined {
  if (!media || media.kind !== "optimized") {
    return undefined;
  }

  return media.src;
}

export function buildImageFallbackOnError(fallbackSrc: string | undefined): string | undefined {
  const normalizedFallbackSrc = fallbackSrc?.trim();
  if (!normalizedFallbackSrc) {
    return undefined;
  }

  const escapedFallbackSrc = JSON.stringify(normalizedFallbackSrc);
  return `if (this.src !== ${escapedFallbackSrc}) { this.onerror = null; this.src = ${escapedFallbackSrc}; }`;
}

interface BrowserImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  fit?: "cover" | "contain" | "inside";
}

export function toBrowserImageUrl(
  source: string,
  { width, height, quality, fit = "cover" }: BrowserImageOptions = {},
): string {
  const normalizedSource = source.trim();
  const params = new URLSearchParams();

  params.set("url", normalizedSource);
  params.set("fit", fit);

  if (Number.isFinite(width) && (width ?? 0) > 0) {
    params.set("w", String(Math.round(width!)));
  }

  if (Number.isFinite(height) && (height ?? 0) > 0) {
    params.set("h", String(Math.round(height!)));
  }

  if (Number.isFinite(quality) && (quality ?? 0) > 0) {
    params.set("q", String(Math.round(quality!)));
  }

  const route = {
    pathname: "/internal-api/media/browser-image",
    search: params.toString(),
  };
  return `${route.pathname}?${route.search}`;
}

const RESPONSIVE_SCALES = [0.5, 0.75, 1, 1.5, 2] as const;

export function buildBrowserImageSrcSet(
  source: string,
  { width, height, quality, fit = "cover" }: BrowserImageOptions = {},
): string | undefined {
  if (!Number.isFinite(width) || (width ?? 0) <= 0) {
    return undefined;
  }

  const trimmedSource = source.trim();
  if (!trimmedSource) {
    return undefined;
  }

  const baseWidth = Math.round(width!);
  const baseHeight = Number.isFinite(height) && (height ?? 0) > 0 ? Math.round(height!) : undefined;
  const aspectRatio = baseHeight ? baseWidth / baseHeight : undefined;
  const seenWidths = new Set<number>();
  const entries: string[] = [];

  for (const scale of RESPONSIVE_SCALES) {
    const scaledWidth = Math.round(baseWidth * scale);
    if (scaledWidth <= 0 || seenWidths.has(scaledWidth)) {
      continue;
    }
    seenWidths.add(scaledWidth);

    const scaledHeight = aspectRatio
      ? Math.round(scaledWidth / aspectRatio)
      : undefined;

    const url = toBrowserImageUrl(trimmedSource, {
      width: scaledWidth,
      height: scaledHeight,
      quality,
      fit,
    });
    entries.push(`${url} ${scaledWidth}w`);
  }

  return entries.length > 0 ? entries.join(", ") : undefined;
}
