import {
  buildPreviewTopMediaMarkup,
  type RenderPreviewTopMediaOptions,
} from "./preview";

export interface PreviewContentRenderState {
  topMedia: RenderPreviewTopMediaOptions;
  bodyHtml: string;
}

interface PreviewContentRenderer {
  render(state: PreviewContentRenderState): void;
}

const REUSABLE_MEDIA_SELECTOR = "iframe[src], video";

function getVideoSource(video: HTMLVideoElement): string {
  const directSrc = video.getAttribute("src")?.trim() ?? "";
  if (directSrc) return directSrc;
  const nestedSource = video.querySelector("source[src]");
  return nestedSource?.getAttribute("src")?.trim() ?? "";
}

function getReusableMediaSignature(element: Element): string | null {
  if (element.tagName === "IFRAME") {
    const src = element.getAttribute("src")?.trim() ?? "";
    return src ? `iframe:${src}` : null;
  }

  if (element.tagName === "VIDEO") {
    const src = getVideoSource(element as HTMLVideoElement);
    return src ? `video:${src}` : null;
  }

  return null;
}

function createFragmentFromMarkup(
  documentObject: Document,
  markup: string,
): DocumentFragment {
  const template = documentObject.createElement("template");
  template.innerHTML = markup;
  return template.content;
}

function collectReusableMedia(root: ParentNode): Map<string, Element[]> {
  const cache = new Map<string, Element[]>();
  for (const element of root.querySelectorAll(REUSABLE_MEDIA_SELECTOR)) {
    const signature = getReusableMediaSignature(element);
    if (!signature) continue;
    const matches = cache.get(signature) ?? [];
    matches.push(element);
    cache.set(signature, matches);
  }
  return cache;
}

function syncReusableMediaAttributes(current: Element, next: Element): void {
  const nextAttributes = new Map(
    Array.from(next.attributes, (attribute) => [attribute.name, attribute.value] as const),
  );

  for (const attribute of Array.from(current.attributes)) {
    if (attribute.name === "src") continue;
    if (!nextAttributes.has(attribute.name)) {
      current.removeAttribute(attribute.name);
    }
  }

  for (const [name, value] of nextAttributes) {
    if (name === "src") continue;
    if (current.getAttribute(name) !== value) {
      current.setAttribute(name, value);
    }
  }
}

function preserveReusableMediaNodes(
  currentRoot: ParentNode,
  nextRoot: ParentNode,
): void {
  const cache = collectReusableMedia(currentRoot);
  for (const nextElement of nextRoot.querySelectorAll(REUSABLE_MEDIA_SELECTOR)) {
    const signature = getReusableMediaSignature(nextElement);
    if (!signature) continue;
    const queue = cache.get(signature);
    const currentElement = queue?.shift();
    if (!currentElement) continue;

    syncReusableMediaAttributes(currentElement, nextElement);
    nextElement.replaceWith(currentElement);
  }
}

function resolveTopMediaSignature(options: RenderPreviewTopMediaOptions): string {
  const imageUrl = options.imageUrl.trim();
  const youtubeUrl = options.youtubeUrl.trim();
  const videoUrl = options.videoUrl.trim();

  if (options.kind === "video" && videoUrl) {
    return `video:${videoUrl}`;
  }

  if (options.kind === "youtube" && youtubeUrl) {
    return `youtube:${youtubeUrl}`;
  }

  if (imageUrl) {
    return `image:${imageUrl}`;
  }

  return "";
}

export function createPreviewContentRenderer(
  previewContent: HTMLElement,
): PreviewContentRenderer {
  const documentObject = previewContent.ownerDocument;
  const topMediaHost = documentObject.createElement("div");
  topMediaHost.className = "writer-preview-top-media-host";
  const bodyHost = documentObject.createElement("div");
  bodyHost.className = "writer-preview-body-host";
  previewContent.replaceChildren(topMediaHost, bodyHost);

  let currentTopMediaSignature = "";
  let currentBodyHtml = "";

  return {
    render(state) {
      const nextTopMediaSignature = resolveTopMediaSignature(state.topMedia);
      if (nextTopMediaSignature !== currentTopMediaSignature) {
        currentTopMediaSignature = nextTopMediaSignature;
        topMediaHost.replaceChildren();

        const topMediaMarkup = buildPreviewTopMediaMarkup(state.topMedia);
        if (topMediaMarkup.trim()) {
          topMediaHost.append(createFragmentFromMarkup(documentObject, topMediaMarkup));
        }
      }

      if (state.bodyHtml === currentBodyHtml) {
        return;
      }

      currentBodyHtml = state.bodyHtml;
      const nextBody = createFragmentFromMarkup(documentObject, state.bodyHtml);
      preserveReusableMediaNodes(bodyHost, nextBody);
      bodyHost.replaceChildren(nextBody);
    },
  };
}
