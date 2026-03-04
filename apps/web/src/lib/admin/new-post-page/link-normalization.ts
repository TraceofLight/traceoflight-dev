function tryDecodeUrlParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeGoogleRedirectUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!parsed.hostname.endsWith("google.com") || parsed.pathname !== "/url") {
      return value;
    }
    const target = parsed.searchParams.get("url");
    if (!target) return value;
    return tryDecodeUrlParam(target);
  } catch {
    return value;
  }
}

function normalizeHttpForHttpsPage(
  value: string,
  pageProtocol: string,
): { value: string; upgraded: boolean } {
  try {
    const parsed = new URL(value);
    if (pageProtocol === "https:" && parsed.protocol === "http:") {
      parsed.protocol = "https:";
      return { value: parsed.toString(), upgraded: true };
    }
    return { value: parsed.toString(), upgraded: false };
  } catch {
    return { value, upgraded: false };
  }
}

export function normalizeCoverUrl(
  rawValue: string,
  pageProtocol: string,
): { value: string; message?: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) return { value: "" };

  const redirected = normalizeGoogleRedirectUrl(trimmed);
  const upgraded = normalizeHttpForHttpsPage(redirected, pageProtocol);

  if (redirected !== trimmed) {
    return {
      value: upgraded.value,
      message: "Google redirect URL was converted to the original source URL.",
    };
  }

  if (upgraded.upgraded) {
    return {
      value: upgraded.value,
      message:
        "HTTP URL was upgraded to HTTPS to avoid mixed-content blocking.",
    };
  }

  return { value: upgraded.value };
}

const LINK_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const RELATIVE_LINK_PATTERN = /^(#|\/|\.\.?\/)/;

function looksLikeExternalHost(value: string): boolean {
  if (value.startsWith("www.")) return true;
  if (value.includes("@")) return false;
  const hostCandidate = value.split("/")[0];
  if (!hostCandidate.includes(".")) return false;
  return /^[a-z0-9.-]+$/i.test(hostCandidate);
}

function normalizeMarkdownLinkTarget(
  rawUrl: string,
  pageProtocol: string,
): string {
  const compactUrl = rawUrl.replace(/\s+/g, "");
  if (!compactUrl) return compactUrl;

  if (RELATIVE_LINK_PATTERN.test(compactUrl)) return compactUrl;

  if (compactUrl.startsWith("//")) {
    const protocol = pageProtocol === "https:" ? "https:" : "http:";
    return normalizeCoverUrl(`${protocol}${compactUrl}`, pageProtocol).value;
  }

  if (LINK_SCHEME_PATTERN.test(compactUrl)) {
    if (!/^https?:\/\//i.test(compactUrl)) return compactUrl;
    return normalizeCoverUrl(compactUrl, pageProtocol).value;
  }

  if (looksLikeExternalHost(compactUrl)) {
    return normalizeCoverUrl(`https://${compactUrl}`, pageProtocol).value;
  }

  return compactUrl;
}

export function splitMarkdownDestinationAndTitle(rawTarget: string): {
  destination: string;
  titlePart: string;
} {
  const trimmed = rawTarget.trim();
  if (!trimmed) return { destination: "", titlePart: "" };

  if (trimmed.startsWith("<")) {
    const closingIndex = trimmed.indexOf(">");
    if (closingIndex > 0) {
      const destination = trimmed.slice(1, closingIndex).trim();
      const titlePart = trimmed.slice(closingIndex + 1).trim();
      return { destination, titlePart };
    }
  }

  const titleMatch = trimmed.match(
    /^(.*?)(?:\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))\s*$/,
  );
  if (!titleMatch) return { destination: trimmed, titlePart: "" };

  const destination = titleMatch[1].trim();
  const titlePart = titleMatch[2].trim();
  return { destination, titlePart };
}

export function rebuildMarkdownLinkTarget(
  destination: string,
  titlePart: string,
): string {
  if (!titlePart) return destination;
  return `${destination} ${titlePart}`.trim();
}

function normalizeMarkdownLinkRawTarget(
  rawTarget: string,
  pageProtocol: string,
): string {
  const { destination, titlePart } =
    splitMarkdownDestinationAndTitle(rawTarget);
  if (!destination) return rawTarget.trim();
  const normalizedDestination = normalizeMarkdownLinkTarget(
    destination,
    pageProtocol,
  );
  return rebuildMarkdownLinkTarget(normalizedDestination, titlePart);
}

function normalizeEscapedMarkdownLinks(
  markdown: string,
  pageProtocol: string,
): string {
  return markdown.replace(
    /\\(!?\[(?:\\.|[^\]])*\\?\])\\?\(([\s\S]*?)\\?\)/g,
    (full, rawLabel, rawUrl) => {
      const normalizedUrl = normalizeMarkdownLinkRawTarget(
        rawUrl,
        pageProtocol,
      );
      if (!normalizedUrl) return full;
      const label = rawLabel.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
      return `${label}(${normalizedUrl})`;
    },
  );
}

export function normalizeMarkdownLinks(
  markdown: string,
  pageProtocol: string,
): string {
  const normalizedEscaped = normalizeEscapedMarkdownLinks(
    markdown,
    pageProtocol,
  );
  return normalizedEscaped.replace(
    /(!?\[[^\]]*]\()([\s\S]*?)(\))/g,
    (full, prefix, rawUrl, suffix) => {
      const normalized = normalizeMarkdownLinkRawTarget(rawUrl, pageProtocol);
      return `${prefix}${normalized}${suffix}`;
    },
  );
}
