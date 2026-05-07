import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_ARTICLE_IMAGE, IMAGE_SIZES } from "@/consts";
import { toBrowserImageUrl } from "@/lib/cover-media";
import { formatDateLabel } from "@/lib/format-date";
import {
  PUBLIC_FIELD_FRAME_CLASS,
  PUBLIC_HOVER_CARD_CLASS,
  PUBLIC_MEDIA_FRAME_CLASS,
  PUBLIC_SECTION_SURFACE_STRONG_CLASS,
} from "@/lib/ui-effects";
import { cn } from "@/lib/utils";

export type BlogArchivePost = {
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  tags: string[];
  publishedAt: string;
  publishedAtValue: number;
  commentCount: number;
  readingLabel: string;
  coverImageSrc: string;
};

export type BlogArchiveTagFilter = {
  slug: string;
  count: number;
};

export type BlogArchiveVisibilityCounts = {
  all: number;
  public: number;
  private: number;
};

type SortMode = "latest" | "oldest" | "title";
type VisibilityMode = "all" | "public" | "private";

type BlogArchiveSummaryResponse = {
  items: BlogArchivePost[];
  totalCount: number;
  nextOffset: number | null;
  hasMore: boolean;
  tagFilters: BlogArchiveTagFilter[];
  visibilityCounts: BlogArchiveVisibilityCounts;
};

export type BlogArchiveLabels = {
  archiveTitle: string;
  archiveDescription: string;
  searchLabel: string;
  searchPlaceholder: string;
  sortLabel: string;
  sortLatest: string;
  sortOldest: string;
  sortTitle: string;
  visibilityAll: string;
  visibilityPublic: string;
  visibilityPrivate: string;
  writePost: string;
  totalCountPrefix: string;
  totalCountSuffix: string;
  commentTitle: string;
  commentCountSuffix: string;
  readPost: string;
  loadingPosts: string;
  loadError: string;
  loadMoreError: string;
  coverImageAlt: string;
  noPosts: string;
};

type BlogArchiveFiltersProps = {
  initialSelectedTags: string[];
  initialQuery?: string;
  initialSort?: SortMode;
  initialVisibility?: VisibilityMode;
  isAdminViewer: boolean;
  initialPosts: BlogArchivePost[];
  initialHasMore: boolean;
  initialOffset: number;
  initialTotalCount?: number;
  initialVisibilityCounts?: BlogArchiveVisibilityCounts;
  tagFilters: BlogArchiveTagFilter[];
  writeHref?: string;
  locale?: string;
  labels?: BlogArchiveLabels;
};

const PAGE_SIZE = 24;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getCoverImageAlt(title: string, altSuffix: string) {
  return `${title} ${altSuffix}`;
}

function buildSummaryRequestUrl(options: {
  offset: number;
  query: string;
  sort: SortMode;
  visibility: VisibilityMode;
  selectedTag: string;
  isAdminViewer: boolean;
  locale: string;
}) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(options.offset),
    sort: options.sort,
  });

  const normalizedQuery = options.query.trim();
  if (normalizedQuery) {
    params.set("query", normalizedQuery);
  }

  if (
    options.visibility !== "all" &&
    (options.visibility === "public" ||
      (options.isAdminViewer && options.visibility === "private"))
  ) {
    params.set("visibility", options.visibility);
  }

  if (options.selectedTag) {
    params.append("tag", options.selectedTag);
  }

  const normalizedLocale = options.locale.trim().toLowerCase();
  if (normalizedLocale) {
    params.set("locale", normalizedLocale);
  }

  return `/internal-api/posts/summary?${params.toString()}`;
}

function toSummaryResponse(payload: unknown): BlogArchiveSummaryResponse {
  const normalizedPayload =
    payload && typeof payload === "object"
      ? (payload as Partial<BlogArchiveSummaryResponse>)
      : {};
  return {
    items: Array.isArray(normalizedPayload.items)
      ? (normalizedPayload.items as BlogArchivePost[])
      : [],
    totalCount:
      typeof normalizedPayload.totalCount === "number"
        ? normalizedPayload.totalCount
        : 0,
    nextOffset:
      typeof normalizedPayload.nextOffset === "number"
        ? normalizedPayload.nextOffset
        : null,
    hasMore: Boolean(normalizedPayload.hasMore),
    tagFilters: Array.isArray(normalizedPayload.tagFilters)
      ? (normalizedPayload.tagFilters as BlogArchiveTagFilter[])
      : [],
    visibilityCounts:
      normalizedPayload.visibilityCounts &&
      typeof normalizedPayload.visibilityCounts === "object"
        ? {
            all:
              typeof normalizedPayload.visibilityCounts.all === "number"
                ? normalizedPayload.visibilityCounts.all
                : typeof normalizedPayload.totalCount === "number"
                  ? normalizedPayload.totalCount
                  : 0,
            public:
              typeof normalizedPayload.visibilityCounts.public === "number"
                ? normalizedPayload.visibilityCounts.public
                : 0,
            private:
              typeof normalizedPayload.visibilityCounts.private === "number"
                ? normalizedPayload.visibilityCounts.private
                : 0,
          }
        : {
            all:
              typeof normalizedPayload.totalCount === "number"
                ? normalizedPayload.totalCount
                : 0,
            public: 0,
            private: 0,
          },
  };
}

function mergeUniquePosts(
  currentPosts: BlogArchivePost[],
  nextPosts: BlogArchivePost[],
) {
  const seen = new Set(currentPosts.map((post) => post.slug));
  const merged = [...currentPosts];
  for (const post of nextPosts) {
    if (seen.has(post.slug)) continue;
    seen.add(post.slug);
    merged.push(post);
  }
  return merged;
}

const fallbackCoverImageSrc = toBrowserImageUrl(DEFAULT_ARTICLE_IMAGE, {
  width: IMAGE_SIZES.postCard.width,
  height: IMAGE_SIZES.postCard.height,
  fit: "inside",
});
const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;
const anchorClass = `flex h-full flex-col p-3 ${PUBLIC_HOVER_CARD_CLASS}`;
const filterChipClass =
  "blog-filter-chip inline-flex h-10 select-none items-center justify-center rounded-full border px-4 text-sm font-medium transition-all duration-200";
const filterChipInactiveClass =
  "border-white/80 bg-slate-100/92 text-foreground/80 shadow-[0_10px_24px_rgba(15,23,42,0.06)] hover:bg-white hover:text-foreground";
const filterChipActiveClass =
  "border-sky-300/90 bg-sky-200/85 text-sky-950 shadow-[0_18px_36px_rgba(56,189,248,0.16)] ring-1 ring-sky-300/80";

const DEFAULT_LABELS: BlogArchiveLabels = {
  archiveTitle: "Blog",
  archiveDescription: "TraceofLight의 개발과 다양한 이야기 Archive",
  searchLabel: "포스트 검색",
  searchPlaceholder: "포스트 검색...",
  sortLabel: "정렬 방식",
  sortLatest: "최신순",
  sortOldest: "오래된순",
  sortTitle: "제목순",
  visibilityAll: "전체",
  visibilityPublic: "공개",
  visibilityPrivate: "비공개",
  writePost: "글 작성",
  totalCountPrefix: "총 ",
  totalCountSuffix: "개의 포스트",
  commentTitle: "댓글",
  commentCountSuffix: "개",
  readPost: "읽기",
  loadingPosts: "포스트를 불러오는 중입니다.",
  loadError: "포스트 목록을 불러오지 못했습니다.",
  loadMoreError: "추가 포스트를 불러오지 못했습니다.",
  coverImageAlt: "대표 이미지",
  noPosts: "게시글이 아직 없습니다.",
};

export function BlogArchiveFilters({
  initialSelectedTags,
  initialQuery = "",
  initialSort = "latest",
  initialVisibility = "all",
  isAdminViewer,
  initialPosts,
  initialHasMore,
  initialOffset,
  initialTotalCount = initialPosts.length,
  initialVisibilityCounts = {
    all: initialTotalCount,
    public: initialPosts.filter((post) => post.visibility === "public").length,
    private: initialPosts.filter((post) => post.visibility === "private").length,
  },
  tagFilters,
  writeHref = "/admin/posts/new?content_kind=blog",
  locale = "ko",
  labels = DEFAULT_LABELS,
}: BlogArchiveFiltersProps) {
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortMode>(initialSort);
  const [visibility, setVisibility] = useState<VisibilityMode>(initialVisibility);
  const [selectedTag, setSelectedTag] = useState(
    normalize(initialSelectedTags[0] ?? ""),
  );
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialOffset);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [availableTagFilters, setAvailableTagFilters] = useState(tagFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const hasMountedFiltersRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const allPostsCount = initialVisibilityCounts.all;
  const normalizedQuery = query.trim();
  const isAllChipActive =
    visibility === "all" && selectedTag.length === 0 && normalizedQuery.length === 0;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tag");
    url.searchParams.delete("query");
    url.searchParams.delete("sort");
    url.searchParams.delete("visibility");
    if (selectedTag) {
      url.searchParams.set("tag", selectedTag);
    }
    if (deferredQuery) {
      url.searchParams.set("query", deferredQuery);
    }
    if (sort !== "latest") {
      url.searchParams.set("sort", sort);
    }
    if (isAdminViewer && visibility !== "all") {
      url.searchParams.set("visibility", visibility);
    }
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [deferredQuery, isAdminViewer, selectedTag, sort, visibility]);

  useEffect(() => {
    if (!hasMountedFiltersRef.current) {
      hasMountedFiltersRef.current = true;
      return;
    }

    let cancelled = false;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setIsRefreshing(true);
    setErrorMessage("");

    void (async () => {
      const response = await fetch(
        buildSummaryRequestUrl({
          offset: 0,
          query: deferredQuery,
          sort,
          visibility,
          selectedTag,
          isAdminViewer,
          locale,
        }),
        { method: "GET" },
      );
      if (!response.ok) {
        throw new Error(`archive fetch failed: ${response.status}`);
      }
      const payload = toSummaryResponse(await response.json());
      if (cancelled || requestSequenceRef.current !== requestSequence) {
        return;
      }
      setPosts(payload.items);
      setHasMore(payload.hasMore);
      setNextOffset(payload.nextOffset ?? payload.items.length);
      setTotalCount(payload.totalCount);
      setAvailableTagFilters(payload.tagFilters);
    })()
      .catch(() => {
        if (cancelled || requestSequenceRef.current !== requestSequence) {
          return;
        }
        setPosts([]);
        setHasMore(false);
        setNextOffset(0);
        setTotalCount(0);
        setErrorMessage(labels.loadError);
      })
      .finally(() => {
        if (cancelled || requestSequenceRef.current !== requestSequence) {
          return;
        }
        setIsRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, isAdminViewer, locale, selectedTag, sort, visibility]);

  useEffect(() => {
    if (!hasMore || isRefreshing || isLoadingMore) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const target = sentinelRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const shouldLoadMore = entries.some((entry) => entry.isIntersecting);
        if (!shouldLoadMore) {
          return;
        }
        observer.unobserve(target);
        setIsLoadingMore(true);
        setErrorMessage("");
        void (async () => {
          const response = await fetch(
            buildSummaryRequestUrl({
              offset: nextOffset,
              query: deferredQuery,
              sort,
              visibility,
              selectedTag,
              isAdminViewer,
              locale,
            }),
            { method: "GET" },
          );
          if (!response.ok) {
            throw new Error(`archive fetch failed: ${response.status}`);
          }
          const payload = toSummaryResponse(await response.json());
          setPosts((currentPosts) => mergeUniquePosts(currentPosts, payload.items));
          setHasMore(payload.hasMore);
          setNextOffset(payload.nextOffset ?? nextOffset + payload.items.length);
          setTotalCount(payload.totalCount);
        })()
          .catch(() => {
            setErrorMessage(labels.loadMoreError);
          })
          .finally(() => {
            setIsLoadingMore(false);
          });
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [
    deferredQuery,
    hasMore,
    isAdminViewer,
    isLoadingMore,
    isRefreshing,
    locale,
    nextOffset,
    selectedTag,
    sort,
    visibility,
  ]);

  const filteredPosts = posts;
  const publicCount = initialVisibilityCounts.public;
  const privateCount = initialVisibilityCounts.private;

  return (
    <section className="space-y-8">
      <header className="space-y-3 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {labels.archiveTitle}
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
          {labels.archiveDescription}
        </p>
      </header>

      <section
        aria-label="Blog archive controls"
        className={`grid gap-5 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="grid flex-1 gap-2" htmlFor="blog-search">
            <span className="sr-only">{labels.searchLabel}</span>
            <div className={PUBLIC_FIELD_FRAME_CLASS}>
              <Input
                autoComplete="off"
                className="border-transparent bg-transparent shadow-none focus-visible:ring-0"
                id="blog-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchPlaceholder}
                value={query}
              />
            </div>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {isAdminViewer ? (
              <Button
                asChild
                className="border-white/80 bg-white/94 shadow-[0_14px_36px_rgba(15,23,42,0.08)] hover:border-sky-200/70 hover:text-sky-700"
                variant="outline"
              >
                <a href={writeHref}>{labels.writePost}</a>
              </Button>
            ) : null}

            <label className="grid gap-2 text-sm text-muted-foreground">
              <span className="sr-only">{labels.sortLabel}</span>
              <div className={PUBLIC_FIELD_FRAME_CLASS}>
                <select
                  aria-label={labels.sortLabel}
                  className="h-10 min-w-36 rounded-xl border border-transparent bg-transparent px-3 text-sm text-foreground outline-none transition focus:border-sky-200 focus:bg-sky-50/70"
                  onChange={(event) => setSort(event.target.value as SortMode)}
                  value={sort}
                >
                  <option value="latest">{labels.sortLatest}</option>
                  <option value="oldest">{labels.sortOldest}</option>
                  <option value="title">{labels.sortTitle}</option>
                </select>
              </div>
            </label>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-pressed={isAllChipActive}
              className={cn(
                filterChipClass,
                isAllChipActive ? filterChipActiveClass : filterChipInactiveClass,
              )}
              data-active={isAllChipActive}
              onClick={() => {
                // Hard reset — clearing tag/query is what lights the chip up.
                setVisibility("all");
                setSelectedTag("");
                setQuery("");
              }}
              type="button"
            >
              {labels.visibilityAll} ({allPostsCount})
            </button>
            {isAdminViewer ? (
              <>
                <button
                  aria-pressed={visibility === "public"}
                  className={cn(
                    filterChipClass,
                    visibility === "public"
                      ? filterChipActiveClass
                      : filterChipInactiveClass,
                  )}
                  data-active={visibility === "public"}
                  onClick={() => setVisibility("public")}
                  type="button"
                >
                  {labels.visibilityPublic} ({publicCount})
                </button>
                <button
                  aria-pressed={visibility === "private"}
                  className={cn(
                    filterChipClass,
                    visibility === "private"
                      ? filterChipActiveClass
                      : filterChipInactiveClass,
                  )}
                  data-active={visibility === "private"}
                  onClick={() => setVisibility("private")}
                  type="button"
                >
                  {labels.visibilityPrivate} ({privateCount})
                </button>
              </>
            ) : null}
          </div>

          {availableTagFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {availableTagFilters.map((tag) => {
                const isActive = selectedTag === tag.slug;

                return (
                  <button
                    key={tag.slug}
                    aria-pressed={isActive}
                    className={cn(
                      filterChipClass,
                      isActive ? filterChipActiveClass : filterChipInactiveClass,
                    )}
                    data-active={isActive}
                    onClick={() =>
                      setSelectedTag((current) =>
                        current === tag.slug ? "" : tag.slug,
                      )
                    }
                    type="button"
                  >
                    {tag.slug} ({tag.count})
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        {`${labels.totalCountPrefix}${totalCount}${labels.totalCountSuffix}`}
      </p>

      {errorMessage ? (
        <div className="rounded-3xl border border-dashed border-rose-200/70 bg-rose-50/80 px-6 py-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {filteredPosts.length === 0 && isRefreshing ? (
        <div
          aria-label={labels.loadingPosts}
          className="flex items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card/50 px-6 py-14"
          data-testid="blog-archive-loading"
          role="status"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPosts.length > 0 ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredPosts.map((post) => (
              <article key={post.slug} className="group h-full">
                <a
                  aria-label={`${post.title} ${labels.readPost}`}
                  className={anchorClass}
                  href={`/${locale}/blog/${post.slug}/`}
                >
                  <div className={mediaFrameClass}>
                    <img
                      alt={getCoverImageAlt(post.title, labels.coverImageAlt)}
                      className="absolute inset-0 block !h-full !w-full !max-w-none object-cover object-center transition duration-300 group-hover:scale-[1.06]"
                      loading="lazy"
                      onError={(event) => {
                        if (event.currentTarget.src !== fallbackCoverImageSrc) {
                          event.currentTarget.src = fallbackCoverImageSrc;
                        }
                      }}
                      src={post.coverImageSrc}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-4 px-2 pb-2 pt-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateLabel(post.publishedAt)}</span>
                      <span aria-hidden="true">•</span>
                      <span>{labels.commentTitle} {post.commentCount}{labels.commentCountSuffix}</span>
                      <span aria-hidden="true">•</span>
                      <span>{post.readingLabel}</span>
                      {isAdminViewer && post.visibility === "private" ? (
                        <Badge className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700">
                          Private
                        </Badge>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold tracking-tight">
                        {post.title}
                      </h3>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {post.description || " "}
                      </p>
                    </div>

                    {post.tags.length > 0 ? (
                      <div className="mt-auto flex flex-wrap gap-2">
                        {post.tags.map((tag) => (
                          <Badge
                            key={`${post.slug}-${tag}`}
                            className="rounded-full border border-border/60 bg-muted px-2.5 py-0.5 text-[0.72rem] font-medium text-muted-foreground"
                            variant="outline"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </a>
              </article>
            ))}
          </section>

          {hasMore ? (
            <div
              ref={sentinelRef}
              aria-hidden="true"
              className="h-10 w-full"
              data-loading={isLoadingMore || isRefreshing}
            />
          ) : null}

          {isRefreshing || isLoadingMore ? (
            <p className="text-center text-sm text-muted-foreground">
              {labels.loadingPosts}
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card/50 px-6 py-14 text-center text-sm text-muted-foreground">
          {labels.noPosts}
        </div>
      )}
    </section>
  );
}

export default BlogArchiveFilters;
