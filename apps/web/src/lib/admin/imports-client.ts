import { readJsonSafe } from "@/lib/http";

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

export async function getPortfolioPdfStatus() {
  const response = await fetch("/internal-api/portfolio/status");
  const payload = await readJsonSafe(response);
  return { response, payload };
}

export async function uploadPortfolioPdf(file: File) {
  const body = new FormData();
  body.set("file", file, file.name);
  const response = await fetch("/internal-api/portfolio/upload", {
    method: "POST",
    body,
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

export async function deletePortfolioPdf() {
  const response = await fetch("/internal-api/portfolio/delete", {
    method: "DELETE",
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

export async function getResumePdfStatus() {
  const response = await fetch("/internal-api/resume/status");
  const payload = await readJsonSafe(response);
  return { response, payload };
}

export async function uploadResumePdf(file: File) {
  const body = new FormData();
  body.set("file", file, file.name);
  const response = await fetch("/internal-api/resume/upload", {
    method: "POST",
    body,
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

export async function deleteResumePdf() {
  const response = await fetch("/internal-api/resume/delete", {
    method: "DELETE",
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

export async function updateOperationalAdminCredentials(loginId: string, password: string) {
  const response = await fetch("/internal-api/auth/credentials", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      loginId,
      password,
    }),
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

export async function updateSiteProfile(email: string, githubUrl: string) {
  const response = await fetch("/internal-api/site-profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      githubUrl,
    }),
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}
