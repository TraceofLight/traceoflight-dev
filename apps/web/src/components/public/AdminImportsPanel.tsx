import { useState } from "react";
import { FileTextIcon } from "lucide-react";

import {
  deletePortfolioPdf,
  deleteResumePdf,
  uploadPortfolioPdf,
  uploadResumePdf,
} from "@/lib/admin/imports-client";
import { DEFAULT_SITE_PROFILE, type SiteProfile } from "@/lib/site-profile";
import {
  PUBLIC_PANEL_SURFACE_SOFT_CLASS,
  PUBLIC_SECTION_SURFACE_STRONG_CLASS,
} from "@/lib/ui-effects";
import AdminCommentsPanel from "./AdminCommentsPanel";
import AdminCredentialDialogs from "./AdminCredentialDialogs";
import AdminSiteProfileSection from "./AdminSiteProfileSection";
import BackupRestoreSection from "./BackupRestoreSection";
import PdfUploadCard, {
  type PdfUploadCardLabels,
  type PdfUploadCardMessages,
} from "./PdfUploadCard";

const PORTFOLIO_LABELS: PdfUploadCardLabels = {
  badge: "Portfolio PDF",
  title: "포트폴리오 파일 교체",
  selectButton: "포트폴리오 PDF 선택",
  selectedEmpty: "선택된 포트폴리오 PDF가 없습니다.",
  uploadButton: "Portfolio PDF 업로드",
  deleteButton: "포트폴리오 PDF 삭제",
  fileInputAriaLabel: "포트폴리오 PDF 파일",
  fileInputId: "admin-imports-portfolio-file",
  uploadButtonId: "admin-imports-portfolio-upload",
  deleteButtonId: "admin-imports-portfolio-delete",
};

const PORTFOLIO_MESSAGES: PdfUploadCardMessages = {
  initialAvailable: "현재 제공 중인 포트폴리오 PDF가 있습니다.",
  initialUnavailable: "현재 제공 중인 포트폴리오 PDF가 없습니다.",
  selectFileRequired: "업로드할 PDF 파일을 선택해 주세요.",
  uploading: "포트폴리오 PDF를 업로드하는 중입니다...",
  uploadSuccess: "포트폴리오 PDF 업로드가 완료되었습니다. 현재 제공 중인 파일이 있습니다.",
  uploadFailureFallback: "포트폴리오 PDF 업로드에 실패했습니다.",
  uploadNetworkError: "포트폴리오 PDF 업로드 중 네트워크 오류가 발생했습니다.",
  deleting: "포트폴리오 PDF를 삭제하는 중입니다...",
  deleteSuccess: "포트폴리오 PDF를 삭제했습니다. 현재 제공 중인 파일이 없습니다.",
  deleteFailureFallback: "포트폴리오 PDF 삭제에 실패했습니다.",
  deleteNetworkError: "포트폴리오 PDF 삭제 중 네트워크 오류가 발생했습니다.",
};

const RESUME_LABELS: PdfUploadCardLabels = {
  badge: "Resume PDF",
  title: "이력서 파일 교체",
  selectButton: "이력서 PDF 선택",
  selectedEmpty: "선택된 이력서 PDF가 없습니다.",
  uploadButton: "Resume PDF 업로드",
  deleteButton: "이력서 PDF 삭제",
  fileInputAriaLabel: "이력서 PDF 파일",
  fileInputId: "admin-imports-resume-file",
  uploadButtonId: "admin-imports-resume-upload",
  deleteButtonId: "admin-imports-resume-delete",
  containerId: "admin-imports-resume-panel",
};

const RESUME_MESSAGES: PdfUploadCardMessages = {
  initialAvailable: "현재 제공 중인 이력서 PDF가 있습니다.",
  initialUnavailable: "현재 제공 중인 이력서 PDF가 없습니다.",
  selectFileRequired: "업로드할 PDF 파일을 선택해 주세요.",
  uploading: "이력서 PDF를 업로드하는 중입니다...",
  uploadSuccess: "이력서 PDF 업로드가 완료되었습니다. 현재 제공 중인 파일이 있습니다.",
  uploadFailureFallback: "이력서 PDF 업로드에 실패했습니다.",
  uploadNetworkError: "이력서 PDF 업로드 중 네트워크 오류가 발생했습니다.",
  deleting: "이력서 PDF를 삭제하는 중입니다...",
  deleteSuccess: "이력서 PDF를 삭제했습니다. 현재 제공 중인 파일이 없습니다.",
  deleteFailureFallback: "이력서 PDF 삭제에 실패했습니다.",
  deleteNetworkError: "이력서 PDF 삭제 중 네트워크 오류가 발생했습니다.",
};

type AdminImportsPanelProps = {
  initialPortfolioAvailable?: boolean;
  initialResumeAvailable?: boolean;
  initialSiteProfile?: SiteProfile;
};

export function AdminImportsPanel({
  initialPortfolioAvailable = false,
  initialResumeAvailable = false,
  initialSiteProfile = DEFAULT_SITE_PROFILE,
}: AdminImportsPanelProps) {
  const [busy, setBusy] = useState(false);

  return (
    <div id="admin-imports-panel" className="grid gap-6">
      <AdminCredentialDialogs />
      <AdminSiteProfileSection initialSiteProfile={initialSiteProfile} />

      <BackupRestoreSection busy={busy} onBusyChange={setBusy} />

      <section className={`grid gap-5 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}>
        <div
          className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5 ${PUBLIC_PANEL_SURFACE_SOFT_CLASS}`}
        >
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-100/90 text-sky-800 shadow-[0_12px_30px_rgba(56,189,248,0.16)]">
            <FileTextIcon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              PDF Utility
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              PDF 파일 관리
            </h2>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
          <PdfUploadCard
            busy={busy}
            deleteFn={deletePortfolioPdf}
            initialAvailable={initialPortfolioAvailable}
            labels={PORTFOLIO_LABELS}
            messages={PORTFOLIO_MESSAGES}
            onBusyChange={setBusy}
            uploadFn={uploadPortfolioPdf}
          />
          <PdfUploadCard
            busy={busy}
            deleteFn={deleteResumePdf}
            initialAvailable={initialResumeAvailable}
            labels={RESUME_LABELS}
            messages={RESUME_MESSAGES}
            onBusyChange={setBusy}
            uploadFn={uploadResumePdf}
          />
        </div>
      </section>

      <div
        aria-label="Comment Review 최근 댓글 검토"
        data-panel="admin-comments-panel"
      >
        <AdminCommentsPanel />
      </div>
    </div>
  );
}

export default AdminImportsPanel;
