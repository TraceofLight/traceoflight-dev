import { GITHUB_URL } from "../consts";

export type SiteProfile = {
  email: string;
  githubUrl: string;
};

export const DEFAULT_SITE_PROFILE: SiteProfile = {
  email: "rickyjun96@gmail.com",
  githubUrl: GITHUB_URL,
};

export function resolveSiteProfile(payload: unknown): SiteProfile {
  const nextPayload =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const email =
    typeof nextPayload.email === "string" && nextPayload.email.trim()
      ? nextPayload.email.trim()
      : DEFAULT_SITE_PROFILE.email;
  const githubUrl =
    typeof nextPayload.githubUrl === "string" && nextPayload.githubUrl.trim()
      ? nextPayload.githubUrl.trim()
      : typeof nextPayload.github_url === "string" && nextPayload.github_url.trim()
        ? nextPayload.github_url.trim()
        : DEFAULT_SITE_PROFILE.githubUrl;

  return {
    email,
    githubUrl,
  };
}

export function buildMailtoHref(email: string): string {
  const normalizedEmail = email.trim() || DEFAULT_SITE_PROFILE.email;
  return `mailto:${normalizedEmail}`;
}
