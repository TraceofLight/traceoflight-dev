import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toBrowserImageUrl } from "@/lib/cover-media";
import { formatDateLabel } from "@/lib/format-date";
import {
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
  readingLabel: string;
  coverImageSrc: string;
};

export type BlogArchiveTagFilter = {
  slug: string;
  count: number;
};

type BlogArchiveFiltersProps = {
  initialSelectedTags: string[];
  isAdminViewer: boolean;
  posts: BlogArchivePost[];
  tagFilters: BlogArchiveTagFilter[];
  writeHref?: string;
};

type SortMode = "latest" | "oldest" | "title";
type VisibilityMode = "all" | "public" | "private";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getCoverImageAlt(title: string) {
  return `${title} 대표 이미지`;
}

const fallbackCoverImageSrc = toBrowserImageUrl("/images/empty-article-image.png", {
  width: 960,
  height: 640,
  fit: "cover",
});
const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;
const anchorClass = `flex h-full flex-col p-3 ${PUBLIC_HOVER_CARD_CLASS}`;
const filterChipClass =
  "blog-filter-chip inline-flex h-10 select-none items-center justify-center rounded-full border px-4 text-sm font-medium transition-all duration-200";
const filterChipInactiveClass =
  "border-white/80 bg-slate-100/92 text-foreground/80 shadow-[0_10px_24px_rgba(15,23,42,0.06)] hover:bg-white hover:text-foreground";
const filterChipActiveClass =
  "border-sky-300/90 bg-sky-200/85 text-sky-950 shadow-[0_18px_36px_rgba(56,189,248,0.16)] ring-1 ring-sky-300/80";

export function BlogArchiveFilters({
  initialSelectedTags,
  isAdminViewer,
  posts,
  tagFilters,
  writeHref = "/admin/posts/new",
}: BlogArchiveFiltersProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("latest");
  const [visibility, setVisibility] = useState<VisibilityMode>("all");
  const [selectedTag, setSelectedTag] = useState(
    normalize(initialSelectedTags[0] ?? ""),
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tag");
    if (selectedTag) {
      url.searchParams.set("tag", selectedTag);
    }
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [selectedTag]);

  const normalizedQuery = normalize(query);
  const filteredPosts = [...posts]
    .filter((post) => {
      const matchesSearch =
        !normalizedQuery ||
        normalize(post.title).includes(normalizedQuery) ||
        normalize(post.description).includes(normalizedQuery);
      const matchesVisibility =
        visibility === "all" || post.visibility === visibility;
      const matchesTag =
        !selectedTag || post.tags.some((tag) => tag === selectedTag);

      return matchesSearch && matchesVisibility && matchesTag;
    })
    .sort((left, right) => {
      if (sort === "oldest") {
        return left.publishedAtValue - right.publishedAtValue;
      }
      if (sort === "title") {
        return left.title.localeCompare(right.title, "ko-KR");
      }
      return right.publishedAtValue - left.publishedAtValue;
    });

  const publicCount = posts.filter((post) => post.visibility === "public").length;
  const privateCount = posts.filter(
    (post) => post.visibility === "private",
  ).length;

  return (
    <section className="space-y-8">
      <header className="space-y-3 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Blog
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
          TraceofLight의 개발과 다양한 이야기 Archive
        </p>
      </header>

        <section
        aria-label="Blog archive controls"
        className={`grid gap-5 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="grid flex-1 gap-2" htmlFor="blog-search">
            <span className="sr-only">포스트 검색</span>
            <div className="rounded-2xl border border-white/80 bg-white/94 p-1 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
              <Input
                autoComplete="off"
                className="border-transparent bg-transparent shadow-none focus-visible:ring-0"
                id="blog-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="포스트 검색..."
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
                <a href={writeHref}>글 작성</a>
              </Button>
            ) : null}

            <label className="grid gap-2 text-sm text-muted-foreground">
              <span className="sr-only">정렬 방식</span>
              <div className="rounded-2xl border border-white/80 bg-white/94 p-1 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
                <select
                  aria-label="정렬 방식"
                  className="h-10 min-w-36 rounded-xl border border-transparent bg-transparent px-3 text-sm text-foreground outline-none transition focus:border-sky-200 focus:bg-sky-50/70"
                  onChange={(event) => setSort(event.target.value as SortMode)}
                  value={sort}
                >
                  <option value="latest">최신순</option>
                  <option value="oldest">오래된순</option>
                  <option value="title">제목순</option>
                </select>
              </div>
            </label>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-pressed={visibility === "all"}
              className={cn(
                filterChipClass,
                visibility === "all"
                  ? filterChipActiveClass
                  : filterChipInactiveClass,
              )}
              onClick={() => setVisibility("all")}
              data-active={visibility === "all"}
              type="button"
            >
              전체 ({posts.length})
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
                  onClick={() => setVisibility("public")}
                  data-active={visibility === "public"}
                  type="button"
                >
                  공개 ({publicCount})
                </button>
                <button
                  aria-pressed={visibility === "private"}
                  className={cn(
                    filterChipClass,
                    visibility === "private"
                      ? filterChipActiveClass
                      : filterChipInactiveClass,
                  )}
                  onClick={() => setVisibility("private")}
                  data-active={visibility === "private"}
                  type="button"
                >
                  비공개 ({privateCount})
                </button>
              </>
            ) : null}
          </div>

          {tagFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {tagFilters.map((tag) => {
                const isActive = selectedTag === tag.slug;

                return (
                  <button
                    key={tag.slug}
                    aria-pressed={isActive}
                    className={cn(
                      filterChipClass,
                      isActive ? filterChipActiveClass : filterChipInactiveClass,
                    )}
                    onClick={() =>
                      setSelectedTag((current) =>
                        current === tag.slug ? "" : tag.slug,
                      )
                    }
                    data-active={isActive}
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
        총 {filteredPosts.length}개의 포스트
      </p>

      {filteredPosts.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPosts.map((post) => (
            <article key={post.slug} className="group h-full">
              <a
                aria-label={`${post.title} 읽기`}
                className={anchorClass}
                href={`/blog/${post.slug}/`}
              >
                <div className={mediaFrameClass}>
                  <img
                    alt={getCoverImageAlt(post.title)}
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
      ) : (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card/50 px-6 py-14 text-center text-sm text-muted-foreground">
          게시글이 아직 없습니다.
        </div>
      )}
    </section>
  );
}

export default BlogArchiveFilters;
