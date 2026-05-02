import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { LogInIcon, ShieldIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resolveImportsErrorMessage,
  updateOperationalAdminCredentials,
} from "@/lib/admin/imports-client";
import type { StatusMessage } from "@/lib/admin/imports-panel-feedback";
import {
  PUBLIC_PANEL_SURFACE_SOFT_CLASS,
  PUBLIC_SECTION_SURFACE_STRONG_CLASS,
  PUBLIC_SURFACE_ACTION_CLASS,
} from "@/lib/ui-effects";

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

const adminActionButtonClass =
  `${PUBLIC_SURFACE_ACTION_CLASS} min-h-11 justify-center self-start hover:border-sky-300/90 hover:text-sky-700 hover:shadow-[0_18px_40px_rgba(49,130,246,0.14)]`;

const LOGIN_INFO_MESSAGE: StatusMessage = {
  message: "현재 관리자 로그인으로 다시 확인해 주세요.",
  state: "info",
};

const UPDATE_INFO_MESSAGE: StatusMessage = {
  message: "새 운영용 아이디와 비밀번호를 저장하면 기존 세션은 모두 만료됩니다.",
  state: "info",
};

export function AdminCredentialDialogs() {
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialLoginOpen, setCredentialLoginOpen] = useState(false);
  const [credentialUpdateOpen, setCredentialUpdateOpen] = useState(false);
  const [credentialLoginId, setCredentialLoginId] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [nextCredentialLoginId, setNextCredentialLoginId] = useState("");
  const [nextCredentialPassword, setNextCredentialPassword] = useState("");
  const [nextCredentialPasswordConfirm, setNextCredentialPasswordConfirm] = useState("");
  const [credentialLoginStatus, setCredentialLoginStatus] = useState<StatusMessage>(
    LOGIN_INFO_MESSAGE,
  );
  const [credentialUpdateStatus, setCredentialUpdateStatus] = useState<StatusMessage>(
    UPDATE_INFO_MESSAGE,
  );

  useEffect(() => {
    if (credentialLoginOpen) {
      return;
    }

    setCredentialLoginId("");
    setCredentialPassword("");
    setCredentialLoginStatus(LOGIN_INFO_MESSAGE);
  }, [credentialLoginOpen]);

  useEffect(() => {
    if (credentialUpdateOpen) {
      return;
    }

    setNextCredentialLoginId("");
    setNextCredentialPassword("");
    setNextCredentialPasswordConfirm("");
    setCredentialUpdateStatus(UPDATE_INFO_MESSAGE);
  }, [credentialUpdateOpen]);

  async function handleCredentialLoginSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    setCredentialBusy(true);
    setCredentialLoginStatus({
      message: "관리자 인증을 확인하는 중입니다...",
      state: "pending",
    });

    try {
      const response = await fetch("/internal-api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: credentialLoginId.trim(),
          password: credentialPassword,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setCredentialLoginStatus({
          message: resolveImportsErrorMessage(payload, "관리자 인증에 실패했습니다."),
          state: "error",
        });
        return;
      }

      setCredentialLoginOpen(false);
      setCredentialUpdateOpen(true);
      setCredentialUpdateStatus({
        message: "새 운영용 아이디와 비밀번호를 입력해 주세요.",
        state: "info",
      });
    } catch {
      setCredentialLoginStatus({
        message: "관리자 인증 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function handleCredentialUpdateSubmit(event: FormSubmitEvent) {
    event.preventDefault();

    const normalizedLoginId = nextCredentialLoginId.trim();
    if (normalizedLoginId.length < 3) {
      setCredentialUpdateStatus({
        message: "새 아이디는 3자 이상 입력해 주세요.",
        state: "error",
      });
      return;
    }

    if (/\s/.test(normalizedLoginId)) {
      setCredentialUpdateStatus({
        message: "아이디에는 공백을 넣을 수 없습니다.",
        state: "error",
      });
      return;
    }

    if (nextCredentialPassword.length < 8) {
      setCredentialUpdateStatus({
        message: "새 비밀번호는 8자 이상 입력해 주세요.",
        state: "error",
      });
      return;
    }

    if (nextCredentialPassword !== nextCredentialPasswordConfirm) {
      setCredentialUpdateStatus({
        message: "비밀번호 확인이 일치하지 않습니다.",
        state: "error",
      });
      return;
    }

    setCredentialBusy(true);
    setCredentialUpdateStatus({
      message: "운영용 관리자 자격증명을 저장하는 중입니다...",
      state: "pending",
    });

    try {
      const { response, payload } = await updateOperationalAdminCredentials(
        normalizedLoginId,
        nextCredentialPassword,
      );
      if (!response.ok) {
        setCredentialUpdateStatus({
          message: resolveImportsErrorMessage(payload, "운영용 관리자 자격증명 저장에 실패했습니다."),
          state: "error",
        });
        return;
      }

      const nextUrl = encodeURIComponent("/admin");
      window.location.assign(`/?admin_login=1&next=${nextUrl}`);
    } catch {
      setCredentialUpdateStatus({
        message: "운영용 관리자 자격증명 저장 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  return (
    <>
      <section className={`grid gap-4 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}>
        <div className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5 ${PUBLIC_PANEL_SURFACE_SOFT_CLASS}`}>
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-100/90 text-sky-800 shadow-[0_12px_30px_rgba(56,189,248,0.16)]">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              Admin Credential
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              운영용 ID / PW 관리
            </h2>
            <p className="text-sm text-muted-foreground">
              현재 관리자 로그인을 한 번 더 확인한 뒤, 운영용 로그인 자격증명을 DB 기준으로 교체합니다.
            </p>
          </div>
          <Button
            className={`${adminActionButtonClass} px-6`}
            id="admin-credential-open"
            onClick={() => setCredentialLoginOpen(true)}
            type="button"
            variant="outline"
          >
            <LogInIcon className="h-4 w-4" />
            ID/PW 수정
          </Button>
        </div>
      </section>

      <Dialog onOpenChange={setCredentialLoginOpen} open={credentialLoginOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>관리자 인증 확인</DialogTitle>
          </DialogHeader>
          <form
            id="admin-credential-login"
            className="grid gap-4"
            onSubmit={handleCredentialLoginSubmit}
          >
            <div className="grid gap-2">
              <Label htmlFor="admin-credential-login-id">아이디</Label>
              <Input
                autoComplete="username"
                disabled={credentialBusy}
                id="admin-credential-login-id"
                onChange={(event) => setCredentialLoginId(event.target.value)}
                required
                value={credentialLoginId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-credential-login-password">비밀번호</Label>
              <Input
                autoComplete="current-password"
                disabled={credentialBusy}
                id="admin-credential-login-password"
                onChange={(event) => setCredentialPassword(event.target.value)}
                required
                type="password"
                value={credentialPassword}
              />
            </div>
            <Button className="w-full" disabled={credentialBusy} type="submit" variant="outline">
              다시 로그인
            </Button>
            <p className="text-sm text-muted-foreground" data-state={credentialLoginStatus.state}>
              {credentialLoginStatus.message}
            </p>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setCredentialUpdateOpen} open={credentialUpdateOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>새 운영용 ID / PW 저장</DialogTitle>
          </DialogHeader>
          <form
            id="admin-credential-update"
            className="grid gap-4"
            onSubmit={handleCredentialUpdateSubmit}
          >
            <div className="grid gap-2">
              <Label htmlFor="admin-credential-next-id">새 아이디</Label>
              <Input
                autoComplete="username"
                disabled={credentialBusy}
                id="admin-credential-next-id"
                onChange={(event) => setNextCredentialLoginId(event.target.value)}
                required
                value={nextCredentialLoginId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-credential-next-password">새 비밀번호</Label>
              <Input
                autoComplete="new-password"
                disabled={credentialBusy}
                id="admin-credential-next-password"
                onChange={(event) => setNextCredentialPassword(event.target.value)}
                required
                type="password"
                value={nextCredentialPassword}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-credential-next-password-confirm">비밀번호 확인</Label>
              <Input
                autoComplete="new-password"
                disabled={credentialBusy}
                id="admin-credential-next-password-confirm"
                onChange={(event) => setNextCredentialPasswordConfirm(event.target.value)}
                required
                type="password"
                value={nextCredentialPasswordConfirm}
              />
            </div>
            <Button className="w-full" disabled={credentialBusy} type="submit" variant="outline">
              새 운영용 ID/PW 저장
            </Button>
            <p className="text-sm text-muted-foreground" data-state={credentialUpdateStatus.state}>
              {credentialUpdateStatus.message}
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AdminCredentialDialogs;
