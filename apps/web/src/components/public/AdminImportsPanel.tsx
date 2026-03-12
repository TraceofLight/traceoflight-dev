import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { DownloadIcon, FileTextIcon, ShieldIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  downloadPostsBackupZip,
  resolveImportsErrorMessage,
  restorePostsBackupZip,
  uploadPortfolioPdf,
  uploadResumePdf,
} from "@/lib/admin/imports-client";
import {
  PUBLIC_FIELD_DISPLAY_CLASS,
  PUBLIC_PANEL_SURFACE_CLASS,
  PUBLIC_PANEL_SURFACE_SOFT_CLASS,
  PUBLIC_SECTION_SURFACE_STRONG_CLASS,
  PUBLIC_SURFACE_ACTION_CLASS,
} from "@/lib/ui-effects";
import { cn } from "@/lib/utils";
import AdminCommentsPanel from "./AdminCommentsPanel";

type FeedbackState = "info" | "pending" | "ok" | "error";

type StatusMessage = {
  message: string;
  state: FeedbackState;
};

const adminActionButtonClass =
  `${PUBLIC_SURFACE_ACTION_CLASS} min-h-11 justify-center self-start hover:border-sky-300/90 hover:text-sky-700 hover:shadow-[0_18px_40px_rgba(49,130,246,0.14)]`;
const adminPrimaryActionButtonClass = `${adminActionButtonClass} w-full px-6`;

const ACTION_STATUS_RESET_MS = 2500;

type AdminImportsPanelProps = {
  initialPortfolioAvailable?: boolean;
};

export function AdminImportsPanel({
  initialPortfolioAvailable = false,
}: AdminImportsPanelProps) {
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPortfolioFile, setSelectedPortfolioFile] = useState<File | null>(null);
  const portfolioFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedResumeFile, setSelectedResumeFile] = useState<File | null>(null);
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null);
  const saveResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<StatusMessage | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<StatusMessage | null>(null);
  const [portfolioStatus, setPortfolioStatus] = useState<StatusMessage>({
    message: initialPortfolioAvailable
      ? "등록된 포트폴리오 PDF가 있습니다."
      : "등록된 포트폴리오 PDF가 없습니다.",
    state: "info",
  });
  const [resumeStatus, setResumeStatus] = useState<StatusMessage>({
    message: initialPortfolioAvailable
      ? "등록된 이력서 PDF가 있습니다."
      : "등록된 이력서 PDF가 없습니다.",
    state: "info",
  });

  useEffect(() => {
    return () => {
      if (saveResetTimeoutRef.current) {
        clearTimeout(saveResetTimeoutRef.current);
      }
      if (restoreResetTimeoutRef.current) {
        clearTimeout(restoreResetTimeoutRef.current);
      }
    };
  }, []);

  function getStatusClass(state: FeedbackState) {
    return cn(
      "rounded-[1.25rem] border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
      state === "error" &&
        "border-red-200/80 bg-red-50/90 text-red-700",
      state === "ok" &&
        "border-sky-200/80 bg-sky-50/90 text-sky-800",
      state === "pending" &&
        "border-white/80 bg-slate-100/88 text-muted-foreground",
      state === "info" &&
        "border-white/80 bg-slate-100/88 text-muted-foreground",
    );
  }

  function setButtonStatus(
    setter: Dispatch<SetStateAction<StatusMessage | null>>,
    timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
    nextStatus: StatusMessage,
  ) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setter(nextStatus);

    if (nextStatus.state === "pending") {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      setter(null);
      timeoutRef.current = null;
    }, ACTION_STATUS_RESET_MS);
  }

  async function handleBackupDownload() {
    setBusy(true);
    setButtonStatus(setSaveStatus, saveResetTimeoutRef, {
      message: "DB 백업 ZIP 생성 중...",
      state: "pending",
    });

    try {
      const { response, payload } = await downloadPostsBackupZip();
      if (!response.ok) {
        setButtonStatus(setSaveStatus, saveResetTimeoutRef, {
          message: resolveImportsErrorMessage(payload, "백업 ZIP 다운로드에 실패했습니다."),
          state: "error",
        });
        return;
      }

      const binary = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const matchedName = disposition.match(/filename="?([^";]+)"?/i);
      const fileName = matchedName?.[1]?.trim() || "traceoflight-posts-backup.zip";
      const url = URL.createObjectURL(binary);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setButtonStatus(setSaveStatus, saveResetTimeoutRef, {
        message: "DB 저장 ZIP 다운로드 시작",
        state: "ok",
      });
    } catch {
      setButtonStatus(setSaveStatus, saveResetTimeoutRef, {
        message: "백업 ZIP 다운로드 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleBackupRestore() {
    if (!selectedFile) {
      setButtonStatus(setRestoreStatus, restoreResetTimeoutRef, {
        message: "복원할 ZIP 파일을 선택해 주세요.",
        state: "error",
      });
      return;
    }

    setBusy(true);
    setButtonStatus(setRestoreStatus, restoreResetTimeoutRef, {
      message: "DB 복원 실행 중...",
      state: "pending",
    });

    try {
      const { response, payload } = await restorePostsBackupZip(selectedFile);
      if (!response.ok) {
        setButtonStatus(setRestoreStatus, restoreResetTimeoutRef, {
          message: resolveImportsErrorMessage(payload, "DB 복원 실행에 실패했습니다."),
          state: "error",
        });
        return;
      }

      const nextPayload = (payload ?? {}) as Record<string, unknown>;
      const restoredPosts =
        typeof nextPayload.restored_posts === "number"
          ? nextPayload.restored_posts
          : 0;
      const restoredMedia =
        typeof nextPayload.restored_media === "number"
          ? nextPayload.restored_media
          : 0;
      const restoredSeriesOverrides =
        typeof nextPayload.restored_series_overrides === "number"
          ? nextPayload.restored_series_overrides
          : 0;

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setButtonStatus(setRestoreStatus, restoreResetTimeoutRef, {
        message: `DB 복원 완료: 게시글 ${restoredPosts}, 미디어 ${restoredMedia}, 시리즈 ${restoredSeriesOverrides}`,
        state: "ok",
      });
    } catch {
      setButtonStatus(setRestoreStatus, restoreResetTimeoutRef, {
        message: "DB 복원 요청 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handlePortfolioUpload() {
    if (!selectedPortfolioFile) {
      setPortfolioStatus({
        message: "업로드할 PDF 파일을 선택해 주세요.",
        state: "error",
      });
      return;
    }

    setBusy(true);
    setPortfolioStatus({
      message: "포트폴리오 PDF를 업로드하는 중입니다...",
      state: "pending",
    });

    try {
      const { response, payload } = await uploadPortfolioPdf(selectedPortfolioFile);
      if (!response.ok) {
        setPortfolioStatus({
          message: resolveImportsErrorMessage(payload, "포트폴리오 PDF 업로드에 실패했습니다."),
          state: "error",
        });
        return;
      }

      setSelectedPortfolioFile(null);
      if (portfolioFileInputRef.current) {
        portfolioFileInputRef.current.value = "";
      }
      setPortfolioStatus({
        message: "포트폴리오 PDF 업로드가 완료되었습니다.",
        state: "ok",
      });
    } catch {
      setPortfolioStatus({
        message: "포트폴리오 PDF 업로드 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeUpload() {
    if (!selectedResumeFile) {
      setResumeStatus({
        message: "업로드할 PDF 파일을 선택해 주세요.",
        state: "error",
      });
      return;
    }

    setBusy(true);
    setResumeStatus({
      message: "이력서 PDF를 업로드하는 중입니다...",
      state: "pending",
    });

    try {
      const { response, payload } = await uploadResumePdf(selectedResumeFile);
      if (!response.ok) {
        setResumeStatus({
          message: resolveImportsErrorMessage(payload, "이력서 PDF 업로드에 실패했습니다."),
          state: "error",
        });
        return;
      }

      setSelectedResumeFile(null);
      if (resumeFileInputRef.current) {
        resumeFileInputRef.current.value = "";
      }
      setResumeStatus({
        message: "이력서 PDF 업로드가 완료되었습니다.",
        state: "ok",
      });
    } catch {
      setResumeStatus({
        message: "이력서 PDF 업로드 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="admin-imports-panel" className="grid gap-6">
      <section className={`grid gap-5 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}>
        <div className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5 ${PUBLIC_PANEL_SURFACE_SOFT_CLASS}`}>
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-100/90 text-sky-800 shadow-[0_12px_30px_rgba(56,189,248,0.16)]">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              Backup Utility
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              서비스 중인 내용 Save & Load
            </h2>
            <p className="text-sm text-muted-foreground">
              현재 운영 데이터를 안전하게 저장하고, 필요할 때 ZIP 기준으로 전체 복원을 실행할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <section className={`grid gap-4 p-5 ${PUBLIC_PANEL_SURFACE_CLASS}`}>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Save
              </p>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                현재 상태 저장
              </h3>
              <p className="text-sm text-muted-foreground">
                게시글, 내부 미디어, 시리즈 커버 override를 ZIP 한 번으로 내려받습니다.
              </p>
            </div>
            <Button
              className={adminPrimaryActionButtonClass}
              disabled={busy}
              id="admin-imports-backup-download"
              onClick={handleBackupDownload}
              type="button"
              variant="outline"
            >
              <DownloadIcon className="h-4 w-4" />
              {saveStatus?.message ?? "DB 저장 ZIP 다운로드"}
            </Button>
          </section>

          <section className={`grid gap-4 p-5 ${PUBLIC_PANEL_SURFACE_CLASS}`}>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Restore
              </p>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                백업 ZIP으로 복원
              </h3>
              <p className="text-sm text-muted-foreground">
                업로드한 ZIP 기준으로 현재 게시글/미디어 상태를 전체 교체합니다.
              </p>
            </div>
            <div className="grid gap-2">
              <input
                accept=".zip,application/zip"
                aria-label="백업 ZIP 파일"
                className="sr-only"
                disabled={busy}
                id="admin-imports-backup-file"
                ref={fileInputRef}
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  className={`${adminActionButtonClass} sm:min-w-36`}
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  ZIP 파일 선택
                </Button>
                <div className={`min-w-0 flex-1 ${PUBLIC_FIELD_DISPLAY_CLASS}`}>
                  <span className="block truncate">
                    {selectedFile ? selectedFile.name : "선택된 파일이 없습니다."}
                  </span>
                </div>
              </div>
            </div>
            <Button
              className={adminPrimaryActionButtonClass}
              disabled={busy}
              id="admin-imports-backup-load"
              onClick={handleBackupRestore}
              type="button"
              variant="outline"
            >
              <UploadIcon className="h-4 w-4" />
              {restoreStatus?.message ?? "ZIP 불러와 DB 복원"}
            </Button>
          </section>
        </div>

        <section className={`grid gap-3 p-4 sm:p-5 ${PUBLIC_PANEL_SURFACE_SOFT_CLASS}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
            복원 전 체크
          </p>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            <li>현재 운영 상태를 먼저 ZIP으로 저장해 두세요.</li>
            <li>복원은 merge가 아니라 전체 replacement입니다.</li>
            <li>복원 후 게시글, 미디어, 시리즈 썸네일 수치를 바로 확인하세요.</li>
          </ul>
        </section>
      </section>

      <section className={`grid gap-5 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}>
        <div className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5 ${PUBLIC_PANEL_SURFACE_SOFT_CLASS}`}>
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
          <section className={`grid gap-4 p-5 ${PUBLIC_PANEL_SURFACE_CLASS}`}>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Portfolio PDF
              </p>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                포트폴리오 파일 교체
              </h3>
            </div>
            <div className="grid gap-2">
              <input
                accept=".pdf,application/pdf"
                aria-label="포트폴리오 PDF 파일"
                className="sr-only"
                disabled={busy}
                id="admin-imports-portfolio-file"
                ref={portfolioFileInputRef}
                onChange={(event) => setSelectedPortfolioFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  className={`${adminActionButtonClass} sm:min-w-36`}
                  disabled={busy}
                  onClick={() => portfolioFileInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  포트폴리오 PDF 선택
                </Button>
                <div className={`min-w-0 flex-1 ${PUBLIC_FIELD_DISPLAY_CLASS}`}>
                  <span className="block truncate">
                    {selectedPortfolioFile
                      ? selectedPortfolioFile.name
                      : "선택된 포트폴리오 PDF가 없습니다."}
                  </span>
                </div>
              </div>
            </div>
            <Button
              className={`${adminActionButtonClass} px-6`}
              disabled={busy}
              id="admin-imports-portfolio-upload"
              onClick={handlePortfolioUpload}
              type="button"
              variant="outline"
            >
              <FileTextIcon className="h-4 w-4" />
              Portfolio PDF 업로드
            </Button>
            <div className={getStatusClass(portfolioStatus.state)}>
              {portfolioStatus.message}
            </div>
          </section>

          <section
            className={`grid gap-4 p-5 ${PUBLIC_PANEL_SURFACE_CLASS}`}
            id="admin-imports-resume-panel"
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Resume PDF
              </p>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                이력서 PDF 관리
              </h3>
              <p className="text-sm text-muted-foreground">
                바깥 공개 경로는 닫혀 있지만, 내부 관리자 경로로는 업로드와 교체를 계속 진행할 수 있습니다.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                이력서 파일 교체
              </h3>
            </div>
            <div className="grid gap-2">
              <input
                accept=".pdf,application/pdf"
                aria-label="이력서 PDF 파일"
                className="sr-only"
                disabled={busy}
                id="admin-imports-resume-file"
                ref={resumeFileInputRef}
                onChange={(event) => setSelectedResumeFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  className={`${adminActionButtonClass} sm:min-w-36`}
                  disabled={busy}
                  onClick={() => resumeFileInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  이력서 PDF 선택
                </Button>
                <div className={`min-w-0 flex-1 ${PUBLIC_FIELD_DISPLAY_CLASS}`}>
                  <span className="block truncate">
                    {selectedResumeFile
                      ? selectedResumeFile.name
                      : "선택된 이력서 PDF가 없습니다."}
                  </span>
                </div>
              </div>
            </div>
            <Button
              className={`${adminActionButtonClass} px-6`}
              disabled={busy}
              id="admin-imports-resume-upload"
              onClick={handleResumeUpload}
              type="button"
              variant="outline"
            >
              <FileTextIcon className="h-4 w-4" />
              Resume PDF 업로드
            </Button>
            <div className={getStatusClass(resumeStatus.state)}>
              {resumeStatus.message}
            </div>
          </section>
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
