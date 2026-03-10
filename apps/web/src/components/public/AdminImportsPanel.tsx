import { useRef, useState } from "react";
import { DownloadIcon, ShieldIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  downloadPostsBackupZip,
  resolveImportsErrorMessage,
  restorePostsBackupZip,
} from "@/lib/admin/imports-client";

type FeedbackState = "info" | "pending" | "ok" | "error";

const adminActionButtonClass =
  "h-11 justify-center self-start hover:-translate-y-0.5 hover:border-sky-300/90 hover:text-sky-700 hover:shadow-[0_18px_40px_rgba(49,130,246,0.14)]";

export function AdminImportsPanel() {
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    state: FeedbackState;
  }>({
    message: "현재 DB의 게시글/미디어를 ZIP으로 저장하거나 ZIP 파일로 복원하세요.",
    state: "info",
  });

  async function handleBackupDownload() {
    setBusy(true);
    setFeedback({
      message: "DB 백업 ZIP을 생성 중입니다...",
      state: "pending",
    });

    try {
      const { response, payload } = await downloadPostsBackupZip();
      if (!response.ok) {
        setFeedback({
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
      setFeedback({
        message: "DB 백업 ZIP 다운로드를 시작했습니다.",
        state: "ok",
      });
    } catch {
      setFeedback({
        message: "백업 ZIP 다운로드 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleBackupRestore() {
    if (!selectedFile) {
      setFeedback({
        message: "복원할 ZIP 파일을 선택해 주세요.",
        state: "error",
      });
      return;
    }

    setBusy(true);
    setFeedback({
      message: "백업 ZIP에서 DB 복원을 실행 중입니다...",
      state: "pending",
    });

    try {
      const { response, payload } = await restorePostsBackupZip(selectedFile);
      if (!response.ok) {
        setFeedback({
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
      setFeedback({
        message: `DB 복원 완료: 게시글 ${restoredPosts}, 미디어 ${restoredMedia}, 시리즈 썸네일 ${restoredSeriesOverrides}`,
        state: "ok",
      });
    } catch {
      setFeedback({
        message: "DB 복원 요청 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="admin-imports-panel"
      className="grid gap-5 rounded-[2.25rem] border border-white/80 bg-white/96 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:p-6"
    >
      <div className="grid gap-3 rounded-[1.75rem] border border-white/80 bg-white/92 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-100/90 text-sky-800 shadow-[0_12px_30px_rgba(56,189,248,0.16)]">
          <ShieldIcon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            Admin Backup Console
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            저장과 복원을 같은 화면에서 관리합니다
          </h2>
          <p className="text-sm text-muted-foreground">
            현재 운영 데이터를 안전하게 저장하고, 필요할 때 ZIP 기준으로 전체 복원을 실행할 수 있습니다.
          </p>
        </div>
      </div>

      <div
        className="rounded-[1.5rem] border border-white/80 bg-slate-100/88 px-4 py-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
        data-state={feedback.state}
        id="admin-imports-feedback"
      >
        {feedback.message}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="grid gap-4 rounded-[1.75rem] border border-white/80 bg-white/92 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
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
          <div className="rounded-[1.4rem] border border-white/80 bg-slate-100/82 px-4 py-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            복원 테스트 전에는 항상 최신 ZIP을 먼저 받아 두는 편이 안전합니다.
          </div>
          <Button
            className={adminActionButtonClass}
            disabled={busy}
            id="admin-imports-backup-download"
            onClick={handleBackupDownload}
            type="button"
            variant="outline"
          >
            <DownloadIcon className="h-4 w-4" />
            DB 저장 ZIP 다운로드
          </Button>
        </section>

        <section className="grid gap-4 rounded-[1.75rem] border border-white/80 bg-white/92 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
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
            <Label htmlFor="admin-imports-backup-file">백업 ZIP 파일</Label>
            <input
              accept=".zip,application/zip"
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
              <div className="min-w-0 flex-1 rounded-[1.25rem] border border-white/80 bg-slate-100/88 px-4 py-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <span className="block truncate">
                  {selectedFile ? selectedFile.name : "선택된 파일이 없습니다."}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              `.zip` 형식의 백업 파일만 업로드할 수 있습니다.
            </p>
          </div>
          <Button
            className={`${adminActionButtonClass} px-6`}
            disabled={busy}
            id="admin-imports-backup-load"
            onClick={handleBackupRestore}
            type="button"
            variant="outline"
          >
            <UploadIcon className="h-4 w-4" />
            ZIP 불러와 DB 복원
          </Button>
        </section>
      </div>

      <section className="grid gap-3 rounded-[1.75rem] border border-sky-200/80 bg-sky-50/90 p-4 text-sm shadow-[0_18px_44px_rgba(56,189,248,0.10)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
          복원 전 체크
        </p>
        <ul className="grid gap-1.5 text-sky-950/80">
          <li>현재 운영 상태를 먼저 ZIP으로 저장해 두세요.</li>
          <li>복원은 merge가 아니라 전체 replacement입니다.</li>
          <li>복원 후 게시글, 미디어, 시리즈 썸네일 수치를 바로 확인하세요.</li>
        </ul>
      </section>
    </section>
  );
}

export default AdminImportsPanel;
