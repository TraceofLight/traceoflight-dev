import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createPreviewContentRenderer } from "../src/lib/admin/new-post-page/preview-renderer.ts";

function createPreviewRoot() {
  const dom = new JSDOM(`<article id="writer-preview-content" class="writer-preview-content"></article>`);
  const document = dom.window.document;
  const previewContent = document.querySelector("#writer-preview-content");
  if (!(previewContent instanceof dom.window.HTMLElement)) {
    throw new Error("preview root missing");
  }
  return { dom, previewContent };
}

test("preview renderer reuses top-media youtube iframe when only body content changes", () => {
  const { dom, previewContent } = createPreviewRoot();
  const renderer = createPreviewContentRenderer(previewContent);

  renderer.render({
    topMedia: {
      kind: "youtube",
      imageUrl: "",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      videoUrl: "",
    },
    bodyHtml: "<p>first body</p>",
  });

  const firstIframe = previewContent.querySelector(".writer-preview-top-media-frame iframe");
  assert.ok(firstIframe instanceof dom.window.HTMLIFrameElement);

  renderer.render({
    topMedia: {
      kind: "youtube",
      imageUrl: "",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      videoUrl: "",
    },
    bodyHtml: "<p>second body</p>",
  });

  const secondIframe = previewContent.querySelector(".writer-preview-top-media-frame iframe");
  assert.equal(secondIframe, firstIframe);
});

test("preview renderer reuses body embed iframes with the same source across html updates", () => {
  const { dom, previewContent } = createPreviewRoot();
  const renderer = createPreviewContentRenderer(previewContent);

  renderer.render({
    topMedia: {
      kind: "image",
      imageUrl: "",
      youtubeUrl: "",
      videoUrl: "",
    },
    bodyHtml: `
      <div class="md-video-embed">
        <iframe src="https://www.youtube-nocookie.com/embed/demo123" title="demo"></iframe>
      </div>
      <p>alpha</p>
    `,
  });

  const firstIframe = previewContent.querySelector(".md-video-embed iframe");
  assert.ok(firstIframe instanceof dom.window.HTMLIFrameElement);

  renderer.render({
    topMedia: {
      kind: "image",
      imageUrl: "",
      youtubeUrl: "",
      videoUrl: "",
    },
    bodyHtml: `
      <p>beta</p>
      <div class="md-video-embed">
        <iframe src="https://www.youtube-nocookie.com/embed/demo123" title="demo"></iframe>
      </div>
    `,
  });

  const secondIframe = previewContent.querySelector(".md-video-embed iframe");
  assert.equal(secondIframe, firstIframe);
});

test("preview renderer reuses body video nodes with the same source across html updates", () => {
  const { dom, previewContent } = createPreviewRoot();
  const renderer = createPreviewContentRenderer(previewContent);

  renderer.render({
    topMedia: {
      kind: "image",
      imageUrl: "",
      youtubeUrl: "",
      videoUrl: "",
    },
    bodyHtml: `
      <p>before</p>
      <video controls preload="metadata" src="/media/demo.mp4"></video>
    `,
  });

  const firstVideo = previewContent.querySelector("video[src='/media/demo.mp4']");
  assert.ok(firstVideo instanceof dom.window.HTMLVideoElement);

  renderer.render({
    topMedia: {
      kind: "image",
      imageUrl: "",
      youtubeUrl: "",
      videoUrl: "",
    },
    bodyHtml: `
      <video controls preload="metadata" src="/media/demo.mp4"></video>
      <p>after</p>
    `,
  });

  const secondVideo = previewContent.querySelector("video[src='/media/demo.mp4']");
  assert.equal(secondVideo, firstVideo);
});
