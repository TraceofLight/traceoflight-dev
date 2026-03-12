import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { renderPreviewMeta } from "../src/lib/admin/new-post-page/preview.ts";

function createElements() {
  const dom = new JSDOM(`
    <section id="meta">
      <div id="kinds"></div>
      <div id="series"></div>
      <div id="project"></div>
      <div id="highlights"></div>
      <div id="links"></div>
    </section>
  `);
  const document = dom.window.document;
  return {
    previewMeta: document.querySelector("#meta") as HTMLElement,
    previewMetaKinds: document.querySelector("#kinds") as HTMLElement,
    previewMetaSeries: document.querySelector("#series") as HTMLElement,
    previewMetaProject: document.querySelector("#project") as HTMLElement,
    previewMetaHighlights: document.querySelector("#highlights") as HTMLElement,
    previewMetaLinks: document.querySelector("#links") as HTMLElement,
  };
}

test("renderPreviewMeta hides project-only blocks for blog content", () => {
  const elements = createElements();

  renderPreviewMeta(elements, {
    contentKind: "blog",
    visibility: "public",
    seriesTitle: "Series A",
    periodLabel: "",
    roleSummary: "",
    projectIntro: "",
    highlights: [],
    links: [],
  });

  assert.equal(elements.previewMeta.hidden, false);
  assert.equal(elements.previewMetaProject.hidden, true);
  assert.equal(elements.previewMetaHighlights.hidden, true);
  assert.equal(elements.previewMetaLinks.hidden, true);
  assert.match(elements.previewMetaKinds.innerHTML, /Blog/);
  assert.match(elements.previewMetaSeries.innerHTML, /Series A/);
});
