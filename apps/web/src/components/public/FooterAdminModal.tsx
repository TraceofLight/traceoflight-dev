import { type FormEvent, useEffect, useState } from "react";
import { DownloadIcon, LogInIcon, ShieldIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FooterAdminModalProps = {
  adminNextPath: string;
  isAdminViewer: boolean;
  shouldOpenOnLoad: boolean;
};

type FeedbackState = "info" | "pending" | "ok" | "error";

function resolveErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const nextPayload = payload as Record<string, unknown>;
    const detail = nextPayload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
    const message = nextPayload.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return fallback;
}

async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function FooterAdminModal({
  adminNextPath,
  isAdminViewer,
  shouldOpenOnLoad,
}: FooterAdminModalProps) {
  const [open, setOpen] = useState(shouldOpenOnLoad);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginFeedback, setLoginFeedback] = useState<{
    message: string;
    state: FeedbackState;
  }>({
    message: "로그인 정보를 입력해 주세요.",
    state: "info",
  });
  const [importFeedback, setImportFeedback] = useState<{
    message: string;
    state: FeedbackState;
  }>({
    message: "현재 DB의 게시글/미디어를 ZIP으로 저장하거나 ZIP 파일로 복원하세요.",
    state: "info",
  });
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!shouldOpenOnLoad) return;

    const current = new URL(window.location.href);
    current.searchParams.delete("admin_login");
    current.searchParams.delete("next");
    window.history.replaceState(
      {},
      "",
      `${current.pathname}${current.search}${current.hash}`,
    );
  }, [shouldOpenOnLoad]);

  useEffect(() => {
    if (open) return;

    setLoginFeedback({
      message: "로그인 정보를 입력해 주세요.",
      state: "info",
    });
    setImportFeedback({
      message: "현재 DB의 게시글/미디어를 ZIP으로 저장하거나 ZIP 파일로 복원하세요.",
      state: "info",
    });
  }, [open]);

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginFeedback({ message: "로그인 처리 중...", state: "pending" });

    try {
      const response = await fetch("/internal-api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const payload = await readJsonSafe(response);
        setLoginFeedback({
          message: resolveErrorMessage(payload, "로그인에 실패했습니다."),
          state: "error",
        });
        return;
      }

      window.location.assign(adminNextPath || "/");
    } catch {
      setLoginFeedback({
        message: "네트워크 오류가 발생했습니다.",
        state: "error",
      });
    }
  }

  async function handleBackupDownload() {
    setBusy(true);
    setImportFeedback({
      message: "DB 백업 ZIP을 생성 중입니다...",
      state: "pending",
    });

    try {
      const response = await fetch("/internal-api/imports/backups/posts.zip");
      if (!response.ok) {
        const payload = await readJsonSafe(response);
        setImportFeedback({
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
      setImportFeedback({
        message: "DB 백업 ZIP 다운로드를 시작했습니다.",
        state: "ok",
      });
    } catch {
      setImportFeedback({
        message: "백업 ZIP 다운로드 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleBackupRestore() {
    if (!selectedFile) {
      setImportFeedback({
        message: "복원할 ZIP 파일을 선택해 주세요.",
        state: "error",
      });
      return;
    }

    setBusy(true);
    setImportFeedback({
      message: "백업 ZIP에서 DB 복원을 실행 중입니다...",
      state: "pending",
    });

    try {
      const body = new FormData();
      body.set("file", selectedFile, selectedFile.name);
      const response = await fetch("/internal-api/imports/backups/load", {
        method: "POST",
        body,
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setImportFeedback({
          message: resolveErrorMessage(payload, "DB 복원 실행에 실패했습니다."),
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
      setImportFeedback({
        message: `DB 복원 완료: 게시글 ${restoredPosts}, 미디어 ${restoredMedia}, 시리즈 썸네일 ${restoredSeriesOverrides}`,
        state: "ok",
      });
    } catch {
      setImportFeedback({
        message: "DB 복원 요청 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label={isAdminViewer ? "Admin Backup" : "Admin Login"}
          className="rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-foreground"
          size="icon"
          variant="outline"
        >
          {isAdminViewer ? (
            <DownloadIcon className="h-4 w-4" />
          ) : (
            <ShieldIcon className="h-4 w-4" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        {!isAdminViewer ? (
          <>
            <DialogHeader>
              <DialogTitle>ADMIN LOGIN</DialogTitle>
            </DialogHeader>
            <form
              id="footer-admin-login-form"
              className="grid gap-4"
              onSubmit={handleLoginSubmit}
            >
              <div className="grid gap-2">
                <Label htmlFor="footer-admin-username">아이디</Label>
                <Input
                  autoComplete="username"
                  id="footer-admin-username"
                  name="username"
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="footer-admin-password">비밀번호</Label>
                <Input
                  autoComplete="current-password"
                  id="footer-admin-password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <Button className="w-full" type="submit">
                <LogInIcon className="mr-1 h-4 w-4" />
                로그인
              </Button>
              <p
                className="text-sm text-muted-foreground"
                data-state={loginFeedback.state}
                id="footer-admin-feedback"
              >
                {loginFeedback.message}
              </p>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>ADMIN BACKUP</DialogTitle>
            </DialogHeader>
            <section className="grid gap-4" id="footer-admin-import-panel">
              <div className="grid gap-2">
                <Label htmlFor="footer-admin-backup-file">백업 ZIP 파일</Label>
                <Input
                  accept=".zip,application/zip"
                  disabled={busy}
                  id="footer-admin-backup-file"
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  disabled={busy}
                  id="footer-admin-backup-download"
                  onClick={handleBackupDownload}
                  type="button"
                  variant="outline"
                >
                  <DownloadIcon className="mr-1 h-4 w-4" />
                  DB 저장 ZIP 다운로드
                </Button>
                <Button
                  disabled={busy}
                  id="footer-admin-backup-load"
                  onClick={handleBackupRestore}
                  type="button"
                >
                  <UploadIcon className="mr-1 h-4 w-4" />
                  ZIP 불러와 DB 복원
                </Button>
              </div>
              <p
                className="text-sm text-muted-foreground"
                data-state={importFeedback.state}
                id="footer-admin-import-feedback"
              >
                {importFeedback.message}
              </p>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FooterAdminModal;
