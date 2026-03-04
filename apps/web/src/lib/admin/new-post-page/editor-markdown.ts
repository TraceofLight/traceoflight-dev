function isLikelyImageLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^!\[[^\]]*]\([\s\S]*\)$/.test(trimmed)) return true;
  if (/^<img\b[\s\S]*>$/i.test(trimmed)) return true;
  if (/^<\/?figure\b[\s\S]*>$/i.test(trimmed)) return true;
  if (/^<\/?figcaption\b[\s\S]*>$/i.test(trimmed)) return true;
  return false;
}

function isLikelyImageScaleLine(line: string): boolean {
  const trimmed = line.trim();
  if (!/^\d+\.\d+$/.test(trimmed)) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 5;
}

function findNearestNonEmptyLine(
  lines: string[],
  startIndex: number,
  direction: 1 | -1,
): string | null {
  let index = startIndex + direction;
  while (index >= 0 && index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed.length > 0) return trimmed;
    index += direction;
  }
  return null;
}

export function sanitizeEditorMarkdown(markdown: string): string {
  const withoutObjectChars = markdown.replace(/\uFFFC/g, "");
  const normalized = withoutObjectChars.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const filtered = lines.filter((line, index) => {
    if (!isLikelyImageScaleLine(line)) return true;
    const prev = findNearestNonEmptyLine(lines, index, -1);
    if (!prev) return true;
    return !isLikelyImageLine(prev);
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n");
}
