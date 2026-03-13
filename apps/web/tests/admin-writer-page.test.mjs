import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { readCssModule } from "./helpers/read-css-module.mjs";

const pagePath = new URL("../src/pages/admin/posts/new.astro", import.meta.url);
const editPagePath = new URL(
  "../src/pages/admin/posts/[slug]/edit.astro",
  import.meta.url,
);
const layoutPath = new URL(
  "../src/layouts/AdminWriterLayout.astro",
  import.meta.url,
);
const bootstrapPath = new URL(
  "../src/lib/admin/writer-page-bootstrap.ts",
  import.meta.url,
);
const stylePath = new URL(
  "../src/styles/components/writer.css",
  import.meta.url,
);
const readWriterStyles = () => readCssModule(stylePath);

test("admin writer page renders post form shell", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /id="admin-post-form"/);
  assert.match(source, /id="milkdown-editor"/);
  assert.match(source, /id="writer-open-drafts"/);
  assert.match(source, /id="writer-open-drafts"[\s\S]*>저장목록<\/button/);
  assert.doesNotMatch(source, /id="writer-open-drafts"[\s\S]*>임시저장<\/button/);
  assert.match(source, /id="writer-draft-layer"/);
  assert.match(source, /id="writer-draft-list"/);
  assert.match(source, /id="writer-draft-feedback"/);
  assert.match(source, /id="writer-toggle-compact-view"/);
  assert.match(source, /id="writer-bottom-bar"/);
  assert.match(source, /id="writer-open-publish"/);
  assert.match(source, /id="writer-publish-layer"/);
  assert.match(source, /id="writer-reauth-layer"/);
  assert.match(source, /id="writer-reauth-form"/);
  assert.doesNotMatch(source, /<form id="writer-reauth-form"/);
  assert.match(source, /id="writer-toast"/);
  assert.doesNotMatch(source, /class="writer-topbar"/);
  assert.doesNotMatch(source, />Metadata</);
});

test("admin writer page bootstraps writer module", async () => {
  const [pageSource, layoutSource, bootstrapSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(layoutPath, "utf8"),
    readFile(bootstrapPath, "utf8"),
  ]);
  assert.match(pageSource, /id="writer-initial-payload"/);
  assert.doesNotMatch(pageSource, /initNewPostAdminPage/);
  assert.doesNotMatch(layoutSource, /import\s*\{\s*initNewPostAdminPage\s*\}/);
  assert.match(layoutSource, /bootAdminWriterPage/);
  assert.match(layoutSource, /import\(["']\.\.\/lib\/admin\/writer-page-bootstrap["']\)/);
  assert.match(layoutSource, /requestIdleCallback/);
  assert.match(layoutSource, /setTimeout\(/);
  assert.match(layoutSource, /astro:page-load/);
  assert.match(bootstrapSource, /initNewPostAdminPage/);
  assert.match(bootstrapSource, /dataset\.writerInitialized/);
  assert.match(bootstrapSource, /dataset\.writerBooting/);
  assert.match(bootstrapSource, /if\s*\(initialized\s*===\s*true\)/);
  assert.match(bootstrapSource, /delete form\.dataset\.writerBooting/);
  assert.match(bootstrapSource, /delete form\.dataset\.writerInitialized/);
});

test("admin writer edit page keeps the project publish fields", async () => {
  const source = await readFile(editPagePath, "utf8");

  assert.match(source, /id="writer-open-drafts"[\s\S]*>저장목록<\/button/);
  assert.doesNotMatch(source, /id="writer-open-drafts"[\s\S]*>임시저장<\/button/);
  assert.match(source, /id="writer-meta-panel"/);
  assert.match(source, /id="writer-slug-prefix"/);
  assert.match(source, /id="post-content-kind"/);
  assert.match(source, /id="writer-project-fields"/);
  assert.match(source, /id="project-period"/);
  assert.match(source, /id="project-role-summary"/);
  assert.match(source, /id="project-intro"/);
  assert.match(source, /id="project-highlights"/);
  assert.match(source, /id="project-resource-links"/);
  assert.match(source, /id="writer-top-media-kind"/);
  assert.match(source, /id="writer-top-media-preview"/);
  assert.match(source, /id="writer-top-media-image-url"/);
  assert.match(source, /id="writer-top-media-youtube-url"/);
  assert.match(source, /id="writer-top-media-video-url"/);
  assert.match(source, /id="writer-top-media-upload-trigger"/);
  assert.match(source, /id="writer-top-media-upload-input"/);
});

test("admin writer layout preloads milkdown theme css statically", async () => {
  const [layoutSource, newPageSource, editPageSource] = await Promise.all([
    readFile(layoutPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(editPagePath, "utf8"),
  ]);

  assert.match(
    layoutSource,
    /@milkdown\/crepe\/theme\/common\/style\.css/,
  );
  assert.match(layoutSource, /@milkdown\/crepe\/theme\/nord\.css/);
  assert.match(newPageSource, /<AdminWriterLayout/);
  assert.match(editPageSource, /<AdminWriterLayout/);
});

test("admin writer page has split editor and preview layout", async () => {
  const source = await readFile(pagePath, "utf8");
  const metaPanelMatch = source.match(
    /<aside[\s\S]*?id="writer-meta-panel"[\s\S]*?<\/aside>/,
  );
  const publishBodyMatch = source.match(
    /<div class="writer-publish-body">[\s\S]*?<\/div>\s*<\/div>\s*<div class="writer-publish-actions">/,
  );

  assert.ok(metaPanelMatch);
  assert.ok(publishBodyMatch);

  assert.match(source, /class="writer-shell"/);
  assert.match(source, /class="writer-shell" data-compact-view="editor"/);
  assert.match(source, /class="writer-pane writer-pane-editor-column"/);
  assert.match(source, /class="writer-title-area"/);
  assert.match(source, /class="writer-meta-panel-wrap"/);
  assert.match(source, /class="writer-pane writer-pane-preview"/);
  assert.match(source, /class="writer-pane writer-pane-meta"/);
  assert.match(source, /id="writer-meta-panel"/);
  assert.match(source, /class="writer-title-area"/);
  assert.match(source, /class="writer-shell"[\s\S]*class="writer-title-area"/);
  assert.match(source, /class="writer-shell"[\s\S]*class="writer-meta-panel-wrap"/);
  assert.match(source, /class="writer-shell"[\s\S]*class="writer-pane writer-pane-editor"/);
  assert.match(source, /class="writer-shell"[\s\S]*class="writer-pane writer-pane-preview"/);
  assert.match(source, /data-has-content="false"/);
  assert.match(source, /id="writer-preview-content"/);
  assert.match(source, /id="writer-preview-meta"/);
  assert.match(source, /id="writer-preview-meta-kinds"/);
  assert.match(source, /id="writer-preview-meta-series"/);
  assert.match(source, /id="writer-preview-meta-project"/);
  assert.match(source, /id="writer-preview-meta-highlights"/);
  assert.match(source, /id="writer-preview-meta-links"/);
  assert.match(
    source,
    /id="writer-preview-meta-project"[\s\S]*class="writer-preview-meta-block"[\s\S]*hidden=\{initialContentKind !== "project"\}/,
  );
  assert.match(
    source,
    /id="writer-preview-meta-highlights"[\s\S]*class="writer-preview-meta-block"[\s\S]*hidden=\{initialContentKind !== "project"\}/,
  );
  assert.match(
    source,
    /id="writer-preview-meta-links"[\s\S]*class="writer-preview-meta-block"[\s\S]*hidden=\{initialContentKind !== "project"\}/,
  );
  assert.match(source, /id="writer-preview-title"><\/h1>/);
  assert.doesNotMatch(source, /id="writer-preview-title">제목 없음</);
  assert.doesNotMatch(source, /id="writer-preview-excerpt"/);
  assert.doesNotMatch(source, /요약을 입력하면 여기에 표시됩니다/);
  assert.doesNotMatch(source, /id="writer-preview-slug"/);
  assert.doesNotMatch(source, /id="writer-preview-cover"/);
  assert.doesNotMatch(source, /Lorem ipsum/);
  assert.doesNotMatch(source, /lorem-ipsum-title/);
  assert.match(source, /id="writer-editor-drop-zone"/);
  assert.match(source, /id="writer-cover-drop-zone"/);
  assert.match(source, /id="writer-cover-preview"/);
  assert.match(source, /id="writer-cover-preview-image"/);
  assert.match(source, /id="writer-cover-preview-empty"/);
  assert.match(source, /id="writer-cover-upload-input"/);
  assert.match(source, /id="writer-top-media-kind"/);
  assert.match(source, /id="writer-top-media-preview"/);
  assert.match(source, /id="writer-top-media-image-url"/);
  assert.match(source, /id="writer-top-media-youtube-url"/);
  assert.match(source, /id="writer-top-media-video-url"/);
  assert.match(source, /id="writer-top-media-upload-trigger"/);
  assert.match(source, /id="writer-top-media-upload-input"/);
  assert.match(source, /id="writer-reauth-layer"/);
  assert.match(source, /id="writer-reauth-username"/);
  assert.match(source, /id="writer-reauth-password"/);
  assert.match(source, /id="writer-reauth-confirm"/);
  assert.match(source, /id="writer-reauth-cancel"/);
  assert.doesNotMatch(source, /id="writer-upload-trigger"/);
  assert.doesNotMatch(source, /id="writer-upload-input"/);
  assert.match(source, /class="writer-publish-body"/);
  assert.match(
    source,
    /class="writer-publish-column writer-publish-column-main"/,
  );
  assert.match(
    source,
    /class="writer-publish-column writer-publish-column-side"/,
  );
  assert.match(source, /class="writer-slug-input-wrap"/);
  assert.match(source, /class="writer-slug-prefix">\/blog\//);
  assert.match(source, /id="writer-slug-feedback"/);
  assert.match(source, /id="post-excerpt"[\s\S]*rows="7"/);
  assert.match(source, /<span>요약<\/span>/);
  assert.match(metaPanelMatch[0], /id="post-visibility"/);
  assert.match(metaPanelMatch[0], /id="post-content-kind"/);
  assert.match(metaPanelMatch[0], /id="post-series"/);
  assert.match(metaPanelMatch[0], /id="writer-series-suggestions"/);
  assert.match(metaPanelMatch[0], /id="writer-project-fields"/);
  assert.match(metaPanelMatch[0], /id="project-intro"/);
  assert.match(metaPanelMatch[0], /id="project-intro"[\s\S]*rows="2"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="project-detail-media-kind"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="project-youtube-url"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="project-detail-video-url"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="project-video-upload-trigger"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="project-video-upload-input"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="project-video-preview"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="project-detail-image-url"/);
  assert.match(publishBodyMatch[0], /id="post-tags"/);
  assert.match(publishBodyMatch[0], /id="writer-tag-chip-list"/);
  assert.match(publishBodyMatch[0], /id="writer-meta-chip-rail"/);
  assert.match(publishBodyMatch[0], /id="writer-tag-suggestions"/);
  assert.match(publishBodyMatch[0], /id="writer-top-media-kind"/);
  assert.match(publishBodyMatch[0], /id="writer-top-media-preview"/);
  assert.match(publishBodyMatch[0], /id="writer-top-media-image-url"/);
  assert.match(publishBodyMatch[0], /id="writer-top-media-youtube-url"/);
  assert.match(publishBodyMatch[0], /id="writer-top-media-video-url"/);
  assert.doesNotMatch(
    source,
    /class="writer-publish-body"[\s\S]*id="post-visibility"/,
  );
  assert.doesNotMatch(
    source,
    /class="writer-publish-body"[\s\S]*id="post-content-kind"/,
  );
  assert.doesNotMatch(
    source,
    /class="writer-publish-body"[\s\S]*id="post-series"/,
  );
  assert.doesNotMatch(metaPanelMatch[0], /id="post-tags"/);
  assert.doesNotMatch(metaPanelMatch[0], /id="writer-tag-chip-list"/);
  assert.doesNotMatch(
    source,
    /class="writer-publish-body"[\s\S]*id="writer-project-fields"/,
  );
  assert.doesNotMatch(source, /<span>Excerpt<\/span>/);
  assert.doesNotMatch(source, /<span>Status<\/span>/);
});

test("admin writer has target-aware drop indicator styles", async () => {
  const source = await readWriterStyles();
  assert.match(source, /\.writer-editor-shell\[data-drop-state=["']active["']]/);
  assert.match(
    source,
    /\.writer-field-cover-drop\[data-drop-state=["']active["']]/,
  );
});

test("admin writer style prevents milkdown link tooltip clipping and button bleed", async () => {
  const source = await readWriterStyles();
  assert.match(
    source,
    /\.writer-editor-shell \.milkdown-editor[\s\S]*overflow:\s*visible/,
  );
  assert.match(
    source,
    /\.writer-editor-shell \.milkdown \.editor[\s\S]*max-width:\s*calc\(100%\s*-\s*4\.75rem\)/,
  );
  assert.match(
    source,
    /\.writer-editor-shell \.milkdown \.editor[\s\S]*margin:\s*0 auto 0 0/,
  );
  assert.match(
    source,
    /\.writer-editor-shell \.milkdown \.editor[\s\S]*padding:\s*0\.95rem 2\.9rem 1\.8rem 1\.3rem/,
  );
  assert.match(
    source,
    /\.writer-editor-shell \.milkdown \.editor[\s\S]*font-family:\s*'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif/,
  );
  assert.match(
    source,
    /\.writer-fallback-textarea[\s\S]*font-family:\s*'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif/,
  );
  assert.match(
    source,
    /\.writer-editor-shell \.milkdown \.milkdown-link-edit > \.link-edit > \.button/,
  );
  assert.doesNotMatch(source, /\.writer-editor-guide/);
  assert.doesNotMatch(source, /\.writer-preview-excerpt\[data-empty='true']/);
  assert.match(
    source,
    /\.writer-cover-preview[\s\S]*aspect-ratio:\s*16\s*\/\s*9/,
  );
  assert.match(
    source,
    /\.writer-cover-preview-image[\s\S]*object-fit:\s*cover/,
  );
  assert.match(
    source,
    /\.writer-field-feedback\[data-state=["']error["']][\s\S]*color:\s*#b43a3a/,
  );
  assert.match(source, /\.writer-preview-head[\s\S]*position:\s*relative/);
  assert.match(
    source,
    /\.writer-preview-head[\s\S]*font-family:\s*'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif/,
  );
  assert.match(
    source,
    /\.writer-preview-meta[\s\S]*font-family:\s*'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif/,
  );
  assert.match(
    source,
    /\.writer-preview-content[\s\S]*font-family:\s*'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif/,
  );
  assert.match(source, /\.writer-preview-kicker[\s\S]*position:\s*absolute/);
  assert.match(source, /\.writer-preview-kicker[\s\S]*left:\s*1\.2rem/);
  assert.match(source, /\.writer-preview-head h1[\s\S]*min-height:\s*56px/);
  assert.match(source, /\.writer-preview-top-media-frame[\s\S]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(source, /\.writer-preview-content :not\(pre\) > code[\s\S]*color:\s*#20426a/);
  assert.match(source, /\.writer-preview-content pre code[\s\S]*color:\s*#f8f8f2/);
  assert.match(source, /\.writer-preview-content \.hljs-keyword[\s\S]*color:\s*#ff79c6/);
  assert.doesNotMatch(source, /\.writer-preview-content code\s*\{/);
});

test("admin writer has editor-side bottom bar and publish layer style", async () => {
  const source = await readWriterStyles();
  assert.match(source, /\.writer-shell[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  assert.match(source, /\.writer-shell[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/);
  assert.match(source, /\.writer-shell[\s\S]*align-items:\s*stretch/);
  assert.match(source, /\.writer-pane\.writer-pane-editor-column[\s\S]*display:\s*contents/);
  assert.match(source, /\.writer-pane\.writer-pane-preview[\s\S]*display:\s*contents/);
  assert.match(source, /\.writer-title-area[\s\S]*grid-column:\s*1/);
  assert.match(source, /\.writer-title-area[\s\S]*grid-row:\s*1/);
  assert.match(source, /\.writer-meta-panel-wrap[\s\S]*grid-column:\s*1/);
  assert.match(source, /\.writer-meta-panel-wrap[\s\S]*grid-row:\s*2/);
  assert.match(source, /\.writer-pane\.writer-pane-editor[\s\S]*grid-column:\s*1/);
  assert.match(source, /\.writer-pane\.writer-pane-editor[\s\S]*grid-row:\s*3/);
  assert.match(source, /\.writer-preview-head[\s\S]*grid-column:\s*2/);
  assert.match(source, /\.writer-preview-head[\s\S]*grid-row:\s*1/);
  assert.match(source, /\.writer-preview-meta[\s\S]*grid-column:\s*2/);
  assert.match(source, /\.writer-preview-meta[\s\S]*grid-row:\s*2/);
  assert.match(source, /\.writer-preview-content[\s\S]*grid-column:\s*2/);
  assert.match(source, /\.writer-preview-content[\s\S]*grid-row:\s*3/);
  assert.match(source, /\.writer-meta-panel-wrap/);
  assert.match(
    source,
    /\.writer-pane\.writer-pane-editor[\s\S]*position:\s*relative/,
  );
  assert.match(
    source,
    /\.writer-bottom-bar[\s\S]*position:\s*fixed/,
  );
  assert.match(
    source,
    /\.writer-bottom-bar[\s\S]*bottom:\s*0/,
  );
  assert.match(
    source,
    /\.writer-bottom-bar[\s\S]*width:\s*50%/,
  );
  assert.match(source, /\.writer-preview-meta/);
  assert.match(source, /\.writer-preview-meta-grid/);
  assert.match(source, /\.writer-publish-layer[\s\S]*align-items:\s*center/);
  assert.match(
    source,
    /\.writer-publish-layer[\s\S]*justify-content:\s*center/,
  );
  assert.match(source, /\.writer-publish-panel[\s\S]*max-width:\s*980px/);
  assert.match(
    source,
    /\.writer-publish-panel[\s\S]*border-radius:\s*1\.25rem/,
  );
  assert.match(
    source,
    /\.writer-publish-body[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+320px/,
  );
  assert.match(source, /\.writer-pane\.writer-pane-meta/);
  assert.match(source, /\.writer-meta-body[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(
    source,
    /\.writer-publish-actions[\s\S]*border-top:\s*1px\s+solid\s+var\(--writer-border\)/,
  );
  assert.match(source, /\.writer-slug-input-wrap[\s\S]*display:\s*flex/);
  assert.match(source, /\.writer-publish-layer\[data-open=["']true["']]/);
  assert.match(source, /\.writer-publish-layer[\s\S]*z-index:\s*55/);
  assert.match(source, /\.writer-toast[\s\S]*position:\s*fixed/);
  assert.match(source, /\.writer-toast[\s\S]*z-index:\s*70/);
  assert.match(source, /\.writer-toast[\s\S]*right:\s*1\.2rem/);
  assert.match(source, /\.writer-toast[\s\S]*top:\s*1\.2rem/);
  assert.match(source, /\.writer-draft-layer/);
  assert.match(source, /\.writer-draft-list/);
  assert.match(source, /\.writer-draft-delete/);
  assert.match(source, /\.writer-compact-toggle[\s\S]*display:\s*none/);
  assert.match(
    source,
    /@media \(max-width:\s*1200px\)[\s\S]*\.writer-compact-toggle[\s\S]*display:\s*inline-flex/,
  );
  assert.match(
    source,
    /@media \(max-width:\s*1200px\)[\s\S]*\.writer-bottom-bar[\s\S]*position:\s*sticky/,
  );
  assert.match(
    source,
    /\.writer-shell\[data-compact-view=["']preview["']\][\s\S]*\.writer-pane\.writer-pane-preview[\s\S]*display:\s*flex/,
  );
  assert.match(
    source,
    /\.writer-shell\[data-compact-view=["']preview["']\][\s\S]*\.writer-pane\.writer-pane-editor-column[\s\S]*visibility:\s*hidden/,
  );
});
