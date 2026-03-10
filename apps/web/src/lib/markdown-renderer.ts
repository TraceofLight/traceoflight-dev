import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

import { configureMarkdownRenderer } from "./markdown-renderer-core";

export function createMarkdownRenderer(): MarkdownIt {
  return configureMarkdownRenderer(new MarkdownIt(), hljs);
}
