import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pagePath = new URL("../src/pages/admin/imports.astro", import.meta.url);
const panelPath = new URL(
  "../src/components/public/AdminImportsPanel.tsx",
  import.meta.url,
);
const siteProfileSectionPath = new URL(
  "../src/components/public/AdminSiteProfileSection.tsx",
  import.meta.url,
);
const credentialDialogsPath = new URL(
  "../src/components/public/AdminCredentialDialogs.tsx",
  import.meta.url,
);
const pageLibPath = new URL("../src/lib/admin/imports-page.ts", import.meta.url);
const clientLibPath = new URL("../src/lib/admin/imports-client.ts", import.meta.url);

test("admin imports page mounts dedicated backup management panel", async () => {
  const [
    pageSource,
    panelSource,
    siteProfileSectionSource,
    credentialDialogsSource,
    pageLibSource,
    clientLibSource,
  ] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(panelPath, "utf8"),
    readFile(siteProfileSectionPath, "utf8"),
    readFile(credentialDialogsPath, "utf8"),
    readFile(pageLibPath, "utf8"),
    readFile(clientLibPath, "utf8"),
  ]);

  const combinedSource = [panelSource, siteProfileSectionSource, credentialDialogsSource].join("\n");

  assert.match(pageSource, /AdminImportsPanel/);
  assert.match(pageSource, /client:load/);
  assert.match(pageSource, /ADMIN_IMPORTS_COPY/);
  assert.match(pageSource, /max-w-6xl/);
  assert.match(pageSource, /requestBackend\(["']\/portfolio\/status["']/);
  assert.match(pageSource, /requestBackend\(["']\/resume\/status["']/);
  assert.match(pageSource, /requestBackend\(["']\/site-profile["']/);
  assert.match(pageSource, /initialResumeAvailable/);
  assert.match(pageSource, /initialSiteProfile/);
  assert.doesNotMatch(pageSource, /text-center/);
  assert.doesNotMatch(pageSource, /<header class=/);
  assert.doesNotMatch(pageSource, /현재 게시글과 미디어 상태를 ZIP으로 보관하고/);
  assert.doesNotMatch(pageSource, /백업 ZIP 복원은 현재 게시글 데이터를 교체하고/);
  assert.doesNotMatch(pageSource, /ADMIN_IMPORTS_PATH/);
  assert.match(panelSource, /admin-imports-panel/);
  assert.match(panelSource, /admin-imports-backup-download/);
  assert.match(panelSource, /admin-imports-backup-file/);
  assert.match(panelSource, /admin-imports-backup-load/);
  assert.match(panelSource, /admin-imports-portfolio-file/);
  assert.match(panelSource, /admin-imports-portfolio-upload/);
  assert.match(panelSource, /admin-imports-portfolio-delete/);
  assert.match(panelSource, /admin-imports-resume-file/);
  assert.match(panelSource, /admin-imports-resume-upload/);
  assert.match(panelSource, /admin-imports-resume-delete/);
  assert.match(panelSource, /admin-imports-resume-panel/);
  assert.match(siteProfileSectionSource, /admin-site-profile-panel/);
  assert.match(siteProfileSectionSource, /admin-site-profile-email/);
  assert.match(siteProfileSectionSource, /admin-site-profile-github/);
  assert.match(siteProfileSectionSource, /admin-site-profile-save/);
  assert.match(panelSource, /AdminCommentsPanel/);
  assert.match(panelSource, /admin-comments-panel/);
  assert.doesNotMatch(combinedSource, /admin-imports-feedback/);
  assert.match(siteProfileSectionSource, /User Info/);
  assert.match(siteProfileSectionSource, /사용자 정보/);
  assert.match(siteProfileSectionSource, /footer 메일\/GitHub 버튼에 연결되는 주소를 바로 수정할 수 있습니다/);
  assert.match(siteProfileSectionSource, /메일 주소/);
  assert.match(siteProfileSectionSource, /GitHub 주소/);
  assert.match(siteProfileSectionSource, /buildMailtoHref/);
  assert.match(siteProfileSectionSource, /사용자 정보 저장/);
  assert.match(panelSource, /현재 상태 저장/);
  assert.match(panelSource, /백업 ZIP으로 복원/);
  assert.match(panelSource, /PDF Utility/);
  assert.match(panelSource, /Portfolio PDF/);
  assert.match(panelSource, /PDF 파일 관리/);
  assert.match(panelSource, /포트폴리오 파일 교체/);
  assert.match(panelSource, /Resume PDF/);
  assert.match(panelSource, /이력서 파일 교체/);
  assert.doesNotMatch(combinedSource, /바깥 공개 경로는 닫혀 있지만/);
  assert.doesNotMatch(combinedSource, /내부 관리자 경로로는 업로드와 교체를 계속 진행할 수 있습니다/);
  assert.doesNotMatch(combinedSource, /이력서 PDF 관리/);
  assert.match(panelSource, /Comment Review/);
  assert.match(panelSource, /최근 댓글 검토/);
  assert.match(panelSource, /복원 전 체크/);
  assert.match(panelSource, /Backup Utility/);
  assert.match(panelSource, /서비스 중인 내용 Save & Load/);
  assert.match(panelSource, /ZIP 파일 선택/);
  assert.match(panelSource, /선택된 파일이 없습니다/);
  assert.doesNotMatch(combinedSource, /복원 테스트 전에는 항상 최신 ZIP을 먼저 받아 두는 편이 안전합니다/);
  assert.match(panelSource, /from ["']@\/lib\/admin\/imports-client["']/);
  assert.match(siteProfileSectionSource, /from ["']@\/lib\/site-profile["']/);
  assert.match(panelSource, /from ["']@\/lib\/ui-effects["']/);
  assert.match(panelSource, /downloadPostsBackupZip/);
  assert.match(panelSource, /restorePostsBackupZip/);
  assert.match(siteProfileSectionSource, /updateSiteProfile/);
  assert.match(panelSource, /self-start/);
  assert.match(panelSource, /PUBLIC_SECTION_SURFACE_STRONG_CLASS/);
  assert.match(panelSource, /PUBLIC_PANEL_SURFACE_CLASS/);
  assert.match(panelSource, /PUBLIC_PANEL_SURFACE_SOFT_CLASS/);
  assert.match(panelSource, /PUBLIC_FIELD_DISPLAY_CLASS/);
  assert.match(panelSource, /PUBLIC_SURFACE_ACTION_CLASS/);
  assert.match(panelSource, /xl:grid-cols-2/);
  assert.match(panelSource, /xl:items-start/);
  assert.match(panelSource, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,0\.92fr\)\]/);
  assert.doesNotMatch(
    combinedSource,
    /<section className="grid gap-3 rounded-\[1\.75rem\] border border-sky-200\/80 bg-sky-50\/90 p-4 text-sm shadow-\[0_18px_44px_rgba\(56,189,248,0\.10\)\]">/,
  );
  assert.doesNotMatch(combinedSource, /function resolveErrorMessage/);
  assert.doesNotMatch(combinedSource, /async function readJsonSafe/);
  assert.match(clientLibSource, /export async function downloadPostsBackupZip/);
  assert.match(clientLibSource, /export async function getPortfolioPdfStatus/);
  assert.match(clientLibSource, /export async function uploadPortfolioPdf/);
  assert.match(clientLibSource, /export async function deletePortfolioPdf/);
  assert.match(clientLibSource, /export async function getResumePdfStatus/);
  assert.match(clientLibSource, /export async function uploadResumePdf/);
  assert.match(clientLibSource, /export async function deleteResumePdf/);
  assert.match(clientLibSource, /export async function updateSiteProfile/);
  assert.match(clientLibSource, /export async function restorePostsBackupZip/);
  assert.match(clientLibSource, /\/internal-api\/portfolio\/status/);
  assert.match(clientLibSource, /\/internal-api\/portfolio\/upload/);
  assert.match(clientLibSource, /\/internal-api\/portfolio\/delete/);
  assert.match(clientLibSource, /\/internal-api\/resume\/status/);
  assert.match(clientLibSource, /\/internal-api\/resume\/upload/);
  assert.match(clientLibSource, /\/internal-api\/resume\/delete/);
  assert.match(clientLibSource, /\/internal-api\/site-profile/);
  assert.match(clientLibSource, /\/internal-api\/imports\/backups\/posts\.zip/);
  assert.match(clientLibSource, /\/internal-api\/imports\/backups\/load/);
  assert.match(pageLibSource, /export const ADMIN_IMPORTS_PATH = ["']\/admin["']/);
  assert.doesNotMatch(pageLibSource, /heading:/);
  assert.doesNotMatch(pageLibSource, /intro:/);
  assert.doesNotMatch(pageLibSource, /detail:/);
  assert.doesNotMatch(pageSource, /Lorem ipsum/i);
});
