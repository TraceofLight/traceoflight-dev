import { useEffect, useState } from "react";
import { LogInIcon, ShieldIcon } from "lucide-react";

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
  shouldOpenOnLoad: boolean;
};

type FeedbackState = "info" | "pending" | "ok" | "error";
type FormSubmitEvent = Parameters<
  NonNullable<React.ComponentProps<"form">["onSubmit"]>
>[0];

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
  }, [open]);

  const handleLoginSubmit = async (event: FormSubmitEvent) => {
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
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <button
          aria-label="Admin Login"
          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/80 bg-white/88 text-muted-foreground shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-white hover:text-sky-700 hover:shadow-[0_18px_40px_rgba(49,130,246,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          type="button"
        >
          <ShieldIcon className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-w-md">
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
      </DialogContent>
    </Dialog>
  );
}

export default FooterAdminModal;
