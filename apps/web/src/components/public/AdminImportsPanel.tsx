import { useState } from "react";
import { DownloadIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  downloadPostsBackupZip,
  resolveImportsErrorMessage,
  restorePostsBackupZip,
} from "@/lib/admin/imports-client";

type FeedbackState = "info" | "pending" | "ok" | "error";

export function AdminImportsPanel() {
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
      className="grid gap-5 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/12 dark:bg-slate-950/72"
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
          Admin Imports
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          IMPORT BACKUP
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <div className="grid gap-2">
          <Label htmlFor="admin-imports-backup-file">백업 ZIP 파일</Label>
          <Input
            accept=".zip,application/zip"
            disabled={busy}
            id="admin-imports-backup-file"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </div>
        <Button
          disabled={busy}
          id="admin-imports-backup-download"
          onClick={handleBackupDownload}
          type="button"
          variant="outline"
        >
          <DownloadIcon className="mr-1 h-4 w-4" />
          DB 저장 ZIP 다운로드
        </Button>
        <Button
          disabled={busy}
          id="admin-imports-backup-load"
          onClick={handleBackupRestore}
          type="button"
        >
          <UploadIcon className="mr-1 h-4 w-4" />
          ZIP 불러와 DB 복원
        </Button>
      </div>

      <p
        className="text-sm text-muted-foreground"
        data-state={feedback.state}
        id="admin-imports-feedback"
      >
        {feedback.message}
      </p>
    </section>
  );
}

export default AdminImportsPanel;
