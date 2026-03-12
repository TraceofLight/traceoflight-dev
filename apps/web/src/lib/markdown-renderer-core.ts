import type MarkdownIt from "markdown-it";

type HighlightJsLike = {
  getLanguage: (language: string) => unknown;
  highlight: (code: string, options: { language: string }) => { value: string };
  highlightAuto: (code: string) => { value: string };
};

const YOUTUBE_DIRECTIVE_MARKER = ":::youtube";
const YOUTUBE_DIRECTIVE_CLOSE = ":::";
const IMAGE_FALLBACK_TEXT = "이미지를 불러올 수 없습니다.";

function isPlaceholderImageAlt(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return /^\d+(?:\.\d+)+$/.test(normalized);
}

function toYoutubeEmbedUrl(rawUrl: string): string | null {
  const normalized = rawUrl.trim();
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    let videoId = "";

    if (url.hostname === "youtu.be") {
      videoId = url.pathname.replace(/^\/+/, "");
    } else if (
      url.hostname === "www.youtube.com" ||
      url.hostname === "youtube.com" ||
      url.hostname === "m.youtube.com"
    ) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") ?? "";
      } else if (url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      } else if (url.pathname.startsWith("/shorts/")) {
        videoId = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      }
    }

    videoId = videoId.trim();
    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch {
    return null;
  }
}

function installYoutubeDirective(markdown: MarkdownIt): void {
  markdown.block.ruler.before(
    "fence",
    "youtube_directive",
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const marker = state.src.slice(start, max).trim();
      if (marker !== YOUTUBE_DIRECTIVE_MARKER) return false;
      if (silent) return true;

      let nextLine = startLine + 1;
      let videoUrl = "";

      while (nextLine < endLine) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineMax = state.eMarks[nextLine];
        const line = state.src.slice(lineStart, lineMax).trim();

        if (line === YOUTUBE_DIRECTIVE_CLOSE) break;
        if (!videoUrl && line.length > 0) {
          videoUrl = line;
        }
        nextLine += 1;
      }

      if (nextLine >= endLine) return false;

      const embedUrl = toYoutubeEmbedUrl(videoUrl);
      if (!embedUrl) return false;

      const token = state.push("youtube_directive", "div", 0);
      token.block = true;
      token.meta = { embedUrl };
      state.line = nextLine + 1;
      return true;
    },
  );

  markdown.renderer.rules.youtube_directive = (tokens, idx) => {
    const embedUrl = tokens[idx].meta?.embedUrl;
    if (typeof embedUrl !== "string" || embedUrl.length === 0) return "";
    const escapedUrl = markdown.utils.escapeHtml(embedUrl);
    return `<div class="md-video-embed"><iframe src="${escapedUrl}" title="YouTube video player" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
  };
}

export function configureMarkdownRenderer(
  markdown: MarkdownIt,
  hljs: HighlightJsLike,
): MarkdownIt {
  markdown.set({
    html: true,
    linkify: true,
    breaks: false,
    highlight: (code, language) => {
      const normalizedLanguage = language.trim().toLowerCase();

      if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
        return hljs.highlight(code, { language: normalizedLanguage }).value;
      }

      return hljs.highlightAuto(code).value;
    },
  });

  type RenderImageRule = NonNullable<typeof markdown.renderer.rules.image>;
  const renderImage: RenderImageRule = (
    tokens,
    idx,
    _options,
    _env,
    _self,
  ) => {
    const token = tokens[idx];
    const src = (token.attrGet("src") ?? "").trim();
    const titleAttrIndex = token.attrIndex("title");
    const titleAttr =
      titleAttrIndex >= 0 ? token.attrs?.[titleAttrIndex] : undefined;
    const caption = (titleAttr?.[1] ?? "").trim();
    const rawAlt = token.content.trim();
    const alt = isPlaceholderImageAlt(rawAlt) ? "" : rawAlt;
    const escapedSrc = markdown.utils.escapeHtml(src);
    const escapedAlt = markdown.utils.escapeHtml(alt);
    const escapedTitle = markdown.utils.escapeHtml(caption);
    const escapedFallbackText = markdown.utils.escapeHtml(IMAGE_FALLBACK_TEXT);
    const titleAttribute = caption ? ` title="${escapedTitle}"` : "";
    const fallbackHtml = `<span class="md-image-fallback" hidden>${escapedFallbackText}</span>`;
    const imageHtml = `<img src="${escapedSrc}" alt="${escapedAlt}"${titleAttribute} loading="lazy" onerror="this.onerror=null; this.style.display='none'; var fallback=this.nextElementSibling; if (fallback) { fallback.hidden=false; }">`;

    if (!caption) return `${imageHtml}${fallbackHtml}`;
    return `<figure class="md-figure">${imageHtml}${fallbackHtml}<figcaption>${escapedTitle}</figcaption></figure>`;
  };
  markdown.renderer.rules.image = renderImage;
  installYoutubeDirective(markdown);

  return markdown;
}
