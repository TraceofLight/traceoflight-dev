const DEFAULT_ADMIN_PATH = '/admin';

export function sanitizeNextPath(input: string | null): string {
  if (!input) return DEFAULT_ADMIN_PATH;
  if (!input.startsWith('/')) return DEFAULT_ADMIN_PATH;
  if (input.startsWith('//')) return DEFAULT_ADMIN_PATH;
  if (input.startsWith('/internal-api')) return DEFAULT_ADMIN_PATH;
  return input;
}
