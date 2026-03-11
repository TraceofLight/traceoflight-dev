export function toYoutubeEmbedUrl(rawUrl: string | null | undefined): string | null {
  const normalized = rawUrl?.trim() ?? "";
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    let videoId = "";

    if (url.hostname === "youtu.be") {
      videoId = url.pathname.replace(/^\/+/, "");
    } else if (
      url.hostname === "www.youtube.com" ||
      url.hostname === "youtube.com" ||
      url.hostname === "m.youtube.com" ||
      url.hostname === "www.youtube-nocookie.com"
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
