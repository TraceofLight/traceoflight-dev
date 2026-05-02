import type { APIRoute } from "astro";

import { DEFAULT_ARTICLE_IMAGE, IMAGE_SIZES } from "../../../consts";
import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../lib/admin-auth";
import { listPublishedDbPostSummaryPage } from "../../../lib/blog-db";
import { toBrowserImageUrl } from "../../../lib/cover-media";

export const prerender = false;

const FALLBACK_COVER_IMAGE_SRC = toBrowserImageUrl(DEFAULT_ARTICLE_IMAGE, {
  width: IMAGE_SIZES.postCard.width,
  height: IMAGE_SIZES.postCard.height,
  fit: "inside",
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseLimit(rawValue: string | null) {
  const parsed = Number(rawValue ?? 24);
  if (!Number.isFinite(parsed)) {
    return 24;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function parseOffset(rawValue: string | null) {
  const parsed = Number(rawValue ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(Math.trunc(parsed), 0);
}

function resolveSort(rawValue: string | null) {
  return rawValue === "oldest" || rawValue === "title" ? rawValue : "latest";
}

function resolveVisibility(rawValue: string | null, isAdminViewer: boolean) {
  if (rawValue === "public") return "public";
  if (isAdminViewer && rawValue === "private") return "private";
  return "all";
}

export const GET: APIRoute = async ({ cookies, url }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  const isAdminViewer = accessToken ? await verifyAccessToken(accessToken) : false;
  const selectedTags = url.searchParams
    .getAll("tag")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  try {
    const summaryPage = await listPublishedDbPostSummaryPage({
      includePrivate: isAdminViewer,
      limit: parseLimit(url.searchParams.get("limit")),
      offset: parseOffset(url.searchParams.get("offset")),
      query: url.searchParams.get("query")?.trim() ?? "",
      sort: resolveSort(url.searchParams.get("sort")),
      visibility: resolveVisibility(url.searchParams.get("visibility"), isAdminViewer),
      tags: selectedTags,
    });

    return jsonResponse({
      items: summaryPage.items.map((post) => ({
        slug: post.slug,
        title: post.title,
        description: post.description,
        visibility: post.visibility,
        tags: post.tags.map((tag) => tag.slug),
        publishedAt: post.publishedAt.toISOString(),
        publishedAtValue: post.publishedAt.valueOf(),
        commentCount: post.commentCount,
        readingLabel: post.readingLabel,
        coverImageSrc: post.coverImageUrl ?? FALLBACK_COVER_IMAGE_SRC,
      })),
      totalCount: summaryPage.totalCount,
      nextOffset: summaryPage.nextOffset,
      hasMore: summaryPage.hasMore,
      tagFilters: summaryPage.tagFilters,
      visibilityCounts: summaryPage.visibilityCounts,
    });
  } catch {
    return jsonResponse({ detail: "backend unavailable" }, 503);
  }
};
