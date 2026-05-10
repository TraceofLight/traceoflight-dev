// Media loading and fallback bindings, replacing inline `onerror=...`
// attributes that would require CSP `script-src 'unsafe-inline'`. Patterns:
//
// 1. `<img data-fallback-src="...">` — swap to fallback URL on error (cover
//    images, post/series/project cards).
// 2. `<img data-md-fallback>` paired with a hidden sibling `<span>` — hide
//    the broken image and reveal the placeholder text (markdown body
//    images; cannot pre-pick a fallback URL).
// 3. `<img|video|iframe data-media-load>` inside `.media-load-frame` — expose
//    loading / loaded / error states for a visual placeholder.
//
// Bind on initial DOM ready and again after every astro:page-load so view
// transitions pick up new content. Mark each element to avoid double-binding.

const FALLBACK_BOUND_FLAG = "fallbackBound";
const MEDIA_BOUND_FLAG = "mediaBound";

type LoadableMediaElement =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLIFrameElement;
type MediaState = "loading" | "loaded" | "error";

function applySrcFallback(img: HTMLImageElement) {
  const fallback = img.dataset.fallbackSrc;
  if (!fallback || img.src === fallback) return;
  img.src = fallback;
}

function applyMdFallback(img: HTMLImageElement) {
  img.style.display = "none";
  const sibling = img.nextElementSibling;
  if (sibling instanceof HTMLElement && sibling.hasAttribute("hidden")) {
    sibling.hidden = false;
  }
}

function isAlreadyErrored(img: HTMLImageElement): boolean {
  // complete=true with naturalWidth=0 = the browser tried and failed before
  // our listener attached. Empty src is intentional empty, not error.
  return img.complete && img.naturalWidth === 0 && img.src.length > 0;
}

function isFallbackSwapPending(img: HTMLImageElement): boolean {
  const fallback = img.dataset.fallbackSrc;
  if (!fallback) return false;
  try {
    return img.src !== new URL(fallback, document.baseURI).href;
  } catch {
    return img.getAttribute("src") !== fallback;
  }
}

function mediaShellFor(media: LoadableMediaElement): HTMLElement {
  return (
    media.closest<HTMLElement>("[data-media-shell], .media-load-frame") ?? media
  );
}

function setMediaState(media: LoadableMediaElement, state: MediaState) {
  const shell = mediaShellFor(media);
  shell.dataset.mediaState = state;
  media.dataset.mediaState = state;
}

function isAlreadyLoaded(media: LoadableMediaElement): boolean {
  if (media instanceof HTMLImageElement) {
    return media.complete && media.naturalWidth > 0;
  }
  if (media instanceof HTMLVideoElement) {
    return media.readyState >= HTMLMediaElement.HAVE_METADATA;
  }
  return false;
}

function applyMediaError(media: LoadableMediaElement) {
  if (media instanceof HTMLImageElement && isFallbackSwapPending(media)) {
    setMediaState(media, "loading");
    return;
  }

  setMediaState(media, "error");
  if (
    media instanceof HTMLImageElement &&
    media.hasAttribute("data-md-fallback")
  ) {
    applyMdFallback(media);
  }
  const sibling = media.nextElementSibling;
  if (
    sibling instanceof HTMLElement &&
    sibling.classList.contains("md-media-fallback") &&
    sibling.hasAttribute("hidden")
  ) {
    sibling.hidden = false;
  }
}

function bindFallback(
  img: HTMLImageElement,
  onError: (img: HTMLImageElement) => void,
) {
  if (img.dataset[FALLBACK_BOUND_FLAG] !== undefined) return;
  img.dataset[FALLBACK_BOUND_FLAG] = "";
  img.addEventListener("error", () => onError(img), { once: true });
  if (isAlreadyErrored(img)) onError(img);
}

function bindMedia(media: LoadableMediaElement) {
  if (media.dataset[MEDIA_BOUND_FLAG] !== undefined) return;
  media.dataset[MEDIA_BOUND_FLAG] = "";
  media.dataset.mediaLoad = "";
  setMediaState(media, "loading");

  if (media instanceof HTMLImageElement) {
    media.addEventListener("load", () => setMediaState(media, "loaded"));
    media.addEventListener("error", () => applyMediaError(media));
    if (isAlreadyLoaded(media)) setMediaState(media, "loaded");
    if (isAlreadyErrored(media)) applyMediaError(media);
    return;
  }

  if (media instanceof HTMLVideoElement) {
    media.addEventListener("loadedmetadata", () =>
      setMediaState(media, "loaded"),
    );
    media.addEventListener("canplay", () => setMediaState(media, "loaded"), {
      once: true,
    });
    media.addEventListener("error", () => applyMediaError(media));
    if (isAlreadyLoaded(media)) setMediaState(media, "loaded");
    return;
  }

  media.addEventListener("load", () => setMediaState(media, "loaded"));
  media.addEventListener("error", () => applyMediaError(media));
}

function bindAll() {
  document
    .querySelectorAll<HTMLImageElement>(
      "img[data-media-load], img[data-fallback-src], img[data-md-fallback]",
    )
    .forEach(bindMedia);
  document
    .querySelectorAll<HTMLVideoElement>(
      "video[data-media-load], .markdown-prose video",
    )
    .forEach(bindMedia);
  document
    .querySelectorAll<HTMLIFrameElement>(
      "iframe[data-media-load], .markdown-prose iframe",
    )
    .forEach(bindMedia);
  document
    .querySelectorAll<HTMLImageElement>("img[data-fallback-src]")
    .forEach((img) => bindFallback(img, applySrcFallback));
  document
    .querySelectorAll<HTMLImageElement>("img[data-md-fallback]")
    .forEach((img) => bindFallback(img, applyMdFallback));
}

document.addEventListener("astro:page-load", bindAll);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindAll);
} else {
  bindAll();
}
