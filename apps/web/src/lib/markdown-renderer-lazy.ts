import type MarkdownIt from "markdown-it";

import { configureMarkdownRenderer } from "./markdown-renderer-core";

let markdownRendererPromise: Promise<MarkdownIt> | null = null;

export async function loadMarkdownRenderer(): Promise<MarkdownIt> {
  if (markdownRendererPromise) {
    return markdownRendererPromise;
  }

  markdownRendererPromise = (async () => {
    const [{ default: MarkdownIt }, { default: hljs }] = await Promise.all([
      import("markdown-it"),
      import("highlight.js/lib/common"),
    ]);

    return configureMarkdownRenderer(new MarkdownIt(), hljs);
  })();

  return markdownRendererPromise;
}
