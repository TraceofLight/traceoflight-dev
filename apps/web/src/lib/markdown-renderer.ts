import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

export function createMarkdownRenderer(): MarkdownIt {
  const markdown = new MarkdownIt({
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

  const defaultImageRule = markdown.renderer.rules.image;
  type RenderImageRule = NonNullable<typeof markdown.renderer.rules.image>;
  const renderImage: RenderImageRule = (
    tokens,
    idx,
    options,
    env,
    self,
  ) => {
    const token = tokens[idx];
    const titleAttrIndex = token.attrIndex('title');
    const titleAttr = titleAttrIndex >= 0 ? token.attrs?.[titleAttrIndex] : undefined;
    const caption = (titleAttr?.[1] ?? '').trim();

    const imageHtml = defaultImageRule
      ? defaultImageRule(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);

    if (!caption) return imageHtml;
    const escapedCaption = markdown.utils.escapeHtml(caption);
    return `<figure class="md-figure">${imageHtml}<figcaption>${escapedCaption}</figcaption></figure>`;
  };
  markdown.renderer.rules.image = renderImage;

  return markdown;
}
