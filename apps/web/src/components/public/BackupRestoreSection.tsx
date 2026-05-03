import { useEffect, useRef, useState } from "react";
import { DownloadIcon, ShieldIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  downloadPostsBackupZip,
  restorePostsBackupZip,
} from "@/lib/admin/imports-client";
import {
  setButtonStatus,
  type StatusMessage,
} from "@/lib/admin/imports-panel-feedback";
import { resolveErrorMessage } from "@/lib/http";
import {
  PUBLIC_FIELD_DISPLAY_CLASS,
  PUBLIC_PANEL_SURFACE_CLASS,
  PUBLIC_PANEL_SURFACE_SOFT_CLASS,
  PUBLIC_SECTION_SURFACE_STRONG_CLASS,
  PUBLIC_SURFACE_ACTION_CLASS,
} from "@/lib/ui-effects";

const adminActionButtonClass =
  `${PUBLIC_SURFACE_ACTION_CLASS} min-h-11 justify-center self-start hover:border-sky-300/90 hover:text-sky-700 hover:shadow-[0_18px_40px_rgba(49,130,246,0.14)]`;
const adminPrimaryActionButtonClass = `${adminActionButtonClass} w-full px-6`;

interface BackupRestoreSectionProps {
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}

export default function BackupRestoreSection({
  busy,
  onBusyChange,
}: BackupRestoreSectionProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<StatusMessage | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<StatusMessage | null>(null);

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

  async function handleBackupDownload() {
    onBusyChange(true);
    setButtonStatus(setSaveStatus, saveResetTimeoutRef, {
      message: "DB 백업 ZIP 생성 중...",
      state: "pending",
    });

    try {
      const { response, payload } = await downloadPostsBackupZip();
      if (!response.ok) {
        setButtonStatus(setSaveStatus, saveResetTimeoutRef, {
          message: resolveErrorMessage(payload, "백업 ZIP 다운로드에 실패했습니다."),
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
      onBusyChange(false);
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

    onBusyChange(true);
    setButtonStatus(setRestoreStatus, restoreResetTimeoutRef, {
      message: "DB 복원 실행 중...",
      state: "pending",
    });

    try {
      const { response, payload } = await restorePostsBackupZip(selectedFile);
      if (!response.ok) {
        setButtonStatus(setRestoreStatus, restoreResetTimeoutRef, {
          message: resolveErrorMessage(payload, "DB 복원 실행에 실패했습니다."),
          state: "error",
        });
        return;
      }

      const nextPayload = (payload ?? {}) as Record<string, unknown>;
      const restoredPosts =
        typeof nextPayload.restored_posts === "number" ? nextPayload.restored_posts : 0;
      const restoredMedia =
        typeof nextPayload.restored_media === "number" ? nextPayload.restored_media : 0;
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
      onBusyChange(false);
    }
  }

  return (
    <section className={`grid gap-5 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}>
      <div
        className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5 ${PUBLIC_PANEL_SURFACE_SOFT_CLASS}`}
      >
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Save</p>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">현재 상태 저장</h3>
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Restore</p>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">백업 ZIP으로 복원</h3>
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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">복원 전 체크</p>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          <li>현재 운영 상태를 먼저 ZIP으로 저장해 두세요.</li>
          <li>복원은 merge가 아니라 전체 replacement입니다.</li>
          <li>복원 후 게시글, 미디어, 시리즈 썸네일 수치를 바로 확인하세요.</li>
        </ul>
      </section>
    </section>
  );
}
