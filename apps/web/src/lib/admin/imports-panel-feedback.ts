import type { Dispatch, SetStateAction } from "react";

import type { FeedbackState } from "@/lib/feedback-state";
import { cn } from "@/lib/utils";

export type { FeedbackState };

export type StatusMessage = {
  message: string;
  state: FeedbackState;
};

export type TimeoutRef = {
  current: ReturnType<typeof setTimeout> | null;
};

export const ACTION_STATUS_RESET_MS = 2500;

export function getStatusClass(state: FeedbackState): string {
  return cn(
    "rounded-[1.25rem] border px-4 py-3 text-sm",
    state === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
    state === "ok" && "border-info/30 bg-info-soft text-primary",
    state === "pending" && "border-surface-border bg-surface-soft text-muted-foreground",
    state === "info" && "border-surface-border bg-surface-soft text-muted-foreground",
  );
}

export function setButtonStatus(
  setter: Dispatch<SetStateAction<StatusMessage | null>>,
  timeoutRef: TimeoutRef,
  nextStatus: StatusMessage,
): void {
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
