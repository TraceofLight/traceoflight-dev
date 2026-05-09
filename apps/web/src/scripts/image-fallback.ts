// Image fallback bindings, replacing inline `onerror=...` attributes that
// would require CSP `script-src 'unsafe-inline'`. Two patterns:
//
// 1. `<img data-fallback-src="...">` — swap to fallback URL on error (cover
//    images, post/series/project cards).
// 2. `<img data-md-fallback>` paired with a hidden sibling `<span>` — hide
//    the broken image and reveal the placeholder text (markdown body
//    images; cannot pre-pick a fallback URL).
//
// Bind on initial DOM ready and again after every astro:page-load so view
// transitions pick up new content. Mark each element to avoid double-binding.

const BOUND_FLAG = "fallbackBound";

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

function bind(img: HTMLImageElement, onError: (img: HTMLImageElement) => void) {
  if (img.dataset[BOUND_FLAG] !== undefined) return;
  img.dataset[BOUND_FLAG] = "";
  img.addEventListener("error", () => onError(img), { once: true });
  if (isAlreadyErrored(img)) onError(img);
}

function bindAll() {
  document
    .querySelectorAll<HTMLImageElement>("img[data-fallback-src]")
    .forEach((img) => bind(img, applySrcFallback));
  document
    .querySelectorAll<HTMLImageElement>("img[data-md-fallback]")
    .forEach((img) => bind(img, applyMdFallback));
}

document.addEventListener("astro:page-load", bindAll);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindAll);
} else {
  bindAll();
}
