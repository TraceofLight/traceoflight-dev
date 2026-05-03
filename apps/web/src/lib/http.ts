export async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function resolveErrorMessage(payload: unknown, fallback: string): string {
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
