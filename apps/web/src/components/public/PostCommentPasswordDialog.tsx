import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  PUBLIC_DANGER_OUTLINE_ACTION_EFFECT_CLASS,
  PUBLIC_SURFACE_ACTION_EFFECT_CLASS,
} from "@/lib/ui-effects";

type PostCommentPasswordDialogProps = {
  actionLabel: string;
  description: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void> | void;
};

export function PostCommentPasswordDialog({
  actionLabel,
  description,
  open,
  onClose,
  onConfirm,
}: PostCommentPasswordDialogProps) {
  const [password, setPassword] = useState("");

  async function handleConfirm() {
    await onConfirm(password);
    setPassword("");
    onClose();
  }

  return (
    <Dialog onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="comment-password-confirm">
            비밀번호
          </label>
          <Input
            id="comment-password-confirm"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </div>
        <DialogFooter>
          <Button
            className={PUBLIC_SURFACE_ACTION_EFFECT_CLASS}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            취소
          </Button>
          <Button
            className={PUBLIC_DANGER_OUTLINE_ACTION_EFFECT_CLASS}
            onClick={() => {
              void handleConfirm();
            }}
            type="button"
            variant="outline"
          >
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PostCommentPasswordDialog;
