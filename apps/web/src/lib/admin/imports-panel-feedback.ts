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
    "rounded-[1.25rem] border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
    state === "error" && "border-red-200/80 bg-red-50/90 text-red-700",
    state === "ok" && "border-sky-200/80 bg-sky-50/90 text-sky-800",
    state === "pending" && "border-white/80 bg-slate-100/88 text-muted-foreground",
    state === "info" && "border-white/80 bg-slate-100/88 text-muted-foreground",
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
