import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it, beforeAll } from "vitest";

import { createMarkdownRenderer } from "@/lib/markdown-renderer";

const previewCssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/styles/components/writer/preview.css",
);

describe("writer preview content styles", () => {
  beforeAll(() => {
    const css = readFileSync(previewCssPath, "utf8");
    const styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  });

  function renderPreviewBody(markdown: string): HTMLElement {
    const md = createMarkdownRenderer();
    const html = md.render(markdown);
    const container = document.createElement("article");
    container.className = "writer-preview-content";
    container.innerHTML = html;
    document.body.replaceChildren(container);
    return container;
  }

  it("applies distinct font sizes to h1, h2, h3, h4", () => {
    renderPreviewBody("# H1\n\n## H2\n\n### H3\n\n#### H4");

    const h1 = document.querySelector(".writer-preview-content h1") as HTMLElement;
    const h2 = document.querySelector(".writer-preview-content h2") as HTMLElement;
    const h3 = document.querySelector(".writer-preview-content h3") as HTMLElement;
    const h4 = document.querySelector(".writer-preview-content h4") as HTMLElement;

    const h1Size = window.getComputedStyle(h1).fontSize;
    const h2Size = window.getComputedStyle(h2).fontSize;
    const h3Size = window.getComputedStyle(h3).fontSize;
    const h4Size = window.getComputedStyle(h4).fontSize;

    // CSS sets h1=2rem, h2=1.5rem, h3=1.25rem, h4=1.1rem
    expect(h1Size).toBe("2rem");
    expect(h2Size).toBe("1.5rem");
    expect(h3Size).toBe("1.25rem");
    expect(h4Size).toBe("1.1rem");
  });

  it("applies bold weight to headings", () => {
    renderPreviewBody("### Heading");
    const h3 = document.querySelector(".writer-preview-content h3") as HTMLElement;
    expect(window.getComputedStyle(h3).fontWeight).toBe("700");
  });

  it("applies bottom margin to paragraphs", () => {
    renderPreviewBody("paragraph one\n\nparagraph two");
    const p = document.querySelector(".writer-preview-content p") as HTMLElement;
    expect(window.getComputedStyle(p).marginBottom).toBe("1rem");
  });

  it("declares disc/decimal list-style and blockquote border in source CSS", () => {
    const css = readFileSync(previewCssPath, "utf8");
    expect(css).toMatch(/\.writer-preview-content ul\s*\{[\s\S]*?list-style:\s*disc/);
    expect(css).toMatch(/\.writer-preview-content ol\s*\{[\s\S]*?list-style:\s*decimal/);
    expect(css).toMatch(/\.writer-preview-content (?:ul|ol)[\s,]*[\s\S]*?padding-left:\s*1\.5rem/);
    expect(css).toMatch(/\.writer-preview-content blockquote\s*\{[\s\S]*?border-left:\s*3px solid/);
  });
});
