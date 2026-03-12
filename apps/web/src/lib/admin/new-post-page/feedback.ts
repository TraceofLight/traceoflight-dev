export function setFeedback(
  target: HTMLElement,
  message: string,
  type: "error" | "ok" | "info" | "pending",
  options: { autoHideMs?: number; hideTimerRef?: { id: number | null } } = {},
): void {
  const autoHideMs = options.autoHideMs ?? 3200;
  target.textContent = message;
  target.dataset.state = type;
  target.setAttribute("data-visible", "true");

  if (options.hideTimerRef && options.hideTimerRef.id !== null) {
    window.clearTimeout(options.hideTimerRef.id);
    options.hideTimerRef.id = null;
  }

  if (autoHideMs <= 0) return;

  const timerId = window.setTimeout(() => {
    target.setAttribute("data-visible", "false");
    if (options.hideTimerRef) {
      options.hideTimerRef.id = null;
    }
  }, autoHideMs);

  if (options.hideTimerRef) {
    options.hideTimerRef.id = timerId;
  }
}

export function normalizeJsonError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "request failed";
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim().length > 0) return message;
  return "request failed";
}

export function isSlugAlreadyExistsError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail !== "string") return false;
  return detail.toLowerCase().includes("post slug already exists");
}
