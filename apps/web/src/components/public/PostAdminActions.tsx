import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  PUBLIC_DANGER_OUTLINE_ACTION_EFFECT_CLASS,
  PUBLIC_DANGER_OUTLINE_ACTION_CLASS,
  PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS,
  PUBLIC_SURFACE_ACTION_EFFECT_CLASS,
} from "@/lib/ui-effects";

type PostAdminActionsProps = {
  adminPostSlug: string;
  onDeleted?: () => void;
};

type FeedbackState = "info" | "error";

export function PostAdminActions({
  adminPostSlug,
  onDeleted,
}: PostAdminActionsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    state: FeedbackState;
  }>({
    message: "",
    state: "info",
  });

  useEffect(() => {
    if (!open) {
      setFeedback({ message: "", state: "info" });
    }
  }, [open]);

  async function handleDelete() {
    const postPath = `/internal-api/posts/${encodeURIComponent(adminPostSlug)}`;

    setBusy(true);
    setFeedback({
      message: "삭제 처리 중...",
      state: "info",
    });

    try {
      let response = await fetch(postPath, {
        method: "DELETE",
      });

      if (response.status === 403) {
        response = await fetch(postPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete" }),
        });
      }

      if (response.ok || response.status === 404) {
        setOpen(false);
        if (onDeleted) {
          onDeleted();
        } else {
          window.location.assign("/blog/");
        }
        return;
      }

      if (response.status === 401) {
        setFeedback({
          message: "관리자 세션이 만료되었습니다. 다시 로그인해 주세요.",
          state: "error",
        });
        return;
      }

      if (response.status === 503) {
        setFeedback({
          message:
            "백엔드 연결 상태가 불안정합니다. 잠시 후 다시 시도해 주세요.",
          state: "error",
        });
        return;
      }

      setFeedback({
        message: "게시글 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        state: "error",
      });
    } catch {
      setFeedback({
        message: "네트워크 오류로 게시글 삭제에 실패했습니다.",
        state: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="post-admin-actions" className="flex flex-wrap items-center gap-2">
      <Button
        asChild
        className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
        variant="outline"
      >
        <a href={`/admin/posts/${encodeURIComponent(adminPostSlug)}/edit`}>
          수정
        </a>
      </Button>

      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogTrigger asChild>
          <Button className={PUBLIC_DANGER_OUTLINE_ACTION_CLASS} variant="outline">
            삭제
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>게시글 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{adminPostSlug}</strong> 게시글을 삭제합니다. 이 작업은
              되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p
            className="text-sm text-muted-foreground"
            data-state={feedback.state}
          >
            {feedback.message}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={PUBLIC_SURFACE_ACTION_EFFECT_CLASS}
              disabled={busy}
            >
              취소
            </AlertDialogCancel>
            <Button
              className={PUBLIC_DANGER_OUTLINE_ACTION_EFFECT_CLASS}
              disabled={busy}
              onClick={handleDelete}
              variant="outline"
            >
              삭제 확인
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PostAdminActions;
