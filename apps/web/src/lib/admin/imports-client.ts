export function resolveImportsErrorMessage(payload: unknown, fallback: string) {
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

export async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function downloadPostsBackupZip() {
  const response = await fetch("/internal-api/imports/backups/posts.zip");
  const payload = response.ok ? null : await readJsonSafe(response);
  return { response, payload };
}

export async function restorePostsBackupZip(file: File) {
  const body = new FormData();
  body.set("file", file, file.name);
  const response = await fetch("/internal-api/imports/backups/load", {
    method: "POST",
    body,
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}
