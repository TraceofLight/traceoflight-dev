export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function doesSlugExist(slug: string): Promise<boolean> {
  const response = await fetch(
    `/internal-api/posts/${encodeURIComponent(slug)}`,
  );
  if (response.status === 404) return false;
  return response.ok;
}

export async function suggestAvailableSlug(
  baseSlug: string,
): Promise<string | null> {
  const normalizedBase = slugify(baseSlug) || "post";
  if (!(await doesSlugExist(normalizedBase))) return normalizedBase;
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${normalizedBase}-${suffix}`;
    if (!(await doesSlugExist(candidate))) {
      return candidate;
    }
  }
  return null;
}
