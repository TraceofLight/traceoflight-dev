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

export function normalizeCoverMedia(source: CoverMediaSource): CoverMedia | undefined {
  if (!source) {
    return undefined;
  }

  if (typeof source === "string") {
    const normalizedSource = source.trim();
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
