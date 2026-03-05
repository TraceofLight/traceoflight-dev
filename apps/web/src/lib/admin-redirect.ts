const DEFAULT_AFTER_LOGIN_PATH = "/";

export function sanitizeNextPath(input: string | null): string {
  if (!input) return DEFAULT_AFTER_LOGIN_PATH;
  if (!input.startsWith("/")) return DEFAULT_AFTER_LOGIN_PATH;
  if (input.startsWith("//")) return DEFAULT_AFTER_LOGIN_PATH;
  if (input.startsWith("/internal-api")) return DEFAULT_AFTER_LOGIN_PATH;
  return input;
}
