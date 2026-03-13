import type MarkdownIt from "markdown-it";

import { configureMarkdownRenderer } from "./markdown-renderer-core";

let markdownRendererPromise: Promise<MarkdownIt> | null = null;

export async function loadMarkdownRenderer(): Promise<MarkdownIt> {
  if (markdownRendererPromise) {
    return markdownRendererPromise;
  }

  markdownRendererPromise = (async () => {
    const [
      { default: MarkdownIt },
      { default: hljs },
      { default: bash },
      { default: cpp },
      { default: css },
      { default: diff },
      { default: java },
      { default: javascript },
      { default: json },
      { default: plaintext },
      { default: python },
      { default: sql },
      { default: typescript },
      { default: xml },
      { default: yaml },
    ] = await Promise.all([
      import("markdown-it"),
      import("highlight.js/lib/core"),
      import("highlight.js/lib/languages/bash"),
      import("highlight.js/lib/languages/cpp"),
      import("highlight.js/lib/languages/css"),
      import("highlight.js/lib/languages/diff"),
      import("highlight.js/lib/languages/java"),
      import("highlight.js/lib/languages/javascript"),
      import("highlight.js/lib/languages/json"),
      import("highlight.js/lib/languages/plaintext"),
      import("highlight.js/lib/languages/python"),
      import("highlight.js/lib/languages/sql"),
      import("highlight.js/lib/languages/typescript"),
      import("highlight.js/lib/languages/xml"),
      import("highlight.js/lib/languages/yaml"),
    ]);

    hljs.registerLanguage("bash", bash);
    hljs.registerLanguage("shell", bash);
    hljs.registerLanguage("cpp", cpp);
    hljs.registerLanguage("c++", cpp);
    hljs.registerLanguage("css", css);
    hljs.registerLanguage("diff", diff);
    hljs.registerLanguage("java", java);
    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("js", javascript);
    hljs.registerLanguage("json", json);
    hljs.registerLanguage("plaintext", plaintext);
    hljs.registerLanguage("text", plaintext);
    hljs.registerLanguage("python", python);
    hljs.registerLanguage("py", python);
    hljs.registerLanguage("sql", sql);
    hljs.registerLanguage("typescript", typescript);
    hljs.registerLanguage("ts", typescript);
    hljs.registerLanguage("xml", xml);
    hljs.registerLanguage("html", xml);
    hljs.registerLanguage("yaml", yaml);
    hljs.registerLanguage("yml", yaml);

    return configureMarkdownRenderer(new MarkdownIt(), hljs);
  })();

  return markdownRendererPromise;
}
