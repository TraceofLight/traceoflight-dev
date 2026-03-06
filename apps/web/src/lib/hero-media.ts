import type { ImageMetadata } from "astro";

export type HeroMediaSource = ImageMetadata | string | null | undefined;

export type HeroMedia =
  | {
      kind: "optimized";
      src: ImageMetadata;
    }
  | {
      kind: "native";
      src: string;
    };

export function normalizeHeroMedia(source: HeroMediaSource): HeroMedia | undefined {
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

export function getHeroMediaMetadata(media: HeroMedia | undefined): ImageMetadata | undefined {
  if (!media || media.kind !== "optimized") {
    return undefined;
  }

  return media.src;
}
