import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BlogArchiveFilters } from "@/components/public/BlogArchiveFilters";

const posts = [
  {
    slug: "astro-intro",
    title: "Astro Intro",
    description: "Astro basics",
    visibility: "public" as const,
    tags: ["astro", "web"],
    publishedAt: "2025-03-04T00:00:00.000Z",
    publishedAtValue: new Date("2025-03-04T00:00:00.000Z").valueOf(),
    commentCount: 2,
    readingLabel: "3 min read",
    coverImageSrc: "/images/empty-article-image.png",
  },
  {
    slug: "react-patterns",
    title: "React Patterns",
    description: "Component patterns",
    visibility: "private" as const,
    tags: ["react"],
    publishedAt: "2025-03-06T00:00:00.000Z",
    publishedAtValue: new Date("2025-03-06T00:00:00.000Z").valueOf(),
    commentCount: 1,
    readingLabel: "5 min read",
    coverImageSrc: "/images/empty-article-image.png",
  },
  {
    slug: "astro-layouts",
    title: "Astro Layouts",
    description: "Composition with layouts",
    visibility: "public" as const,
    tags: ["astro"],
    publishedAt: "2025-03-01T00:00:00.000Z",
    publishedAtValue: new Date("2025-03-01T00:00:00.000Z").valueOf(),
    commentCount: 0,
    readingLabel: "4 min read",
    coverImageSrc: "/images/empty-article-image.png",
  },
];

const tagFilters = [
  { slug: "astro", count: 2 },
  { slug: "react", count: 1 },
  { slug: "web", count: 1 },
];

function createSummaryPayload(items: typeof posts, overrides?: Partial<{
  totalCount: number;
  nextOffset: number | null;
  hasMore: boolean;
  tagFilters: typeof tagFilters;
  visibilityCounts: { all: number; public: number; private: number };
}>) {
  return {
    items,
    totalCount: overrides?.totalCount ?? items.length,
    nextOffset: overrides?.nextOffset ?? null,
    hasMore: overrides?.hasMore ?? false,
    tagFilters: overrides?.tagFilters ?? tagFilters,
    visibilityCounts: overrides?.visibilityCounts ?? {
      all: items.length,
      public: items.filter((post) => post.visibility === "public").length,
      private: items.filter((post) => post.visibility === "private").length,
    },
  };
}

describe("BlogArchiveFilters", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/blog");
    vi.restoreAllMocks();
  });

  it("requests filtered summaries by search and tag while syncing the tag query string", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createSummaryPayload([posts[0], posts[2]], {
            totalCount: 2,
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createSummaryPayload([posts[2]], {
            totalCount: 1,
            tagFilters: [{ slug: "astro", count: 1 }],
          }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BlogArchiveFilters
        initialSelectedTags={[]}
        initialQuery=""
        initialSort="latest"
        initialVisibility="all"
        isAdminViewer={false}
        initialPosts={posts}
        initialHasMore={false}
        initialOffset={posts.length}
        initialTotalCount={posts.length}
        initialVisibilityCounts={{ all: 3, public: 2, private: 1 }}
        tagFilters={tagFilters}
        writeHref="/admin/posts/new"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Journal")).not.toBeInTheDocument();
    expect(screen.getByText("총 3개의 포스트")).toBeInTheDocument();

    const astroTagButton = screen.getByRole("button", { name: "astro (2)" });

    fireEvent.click(astroTagButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/internal-api/posts/summary?"),
        expect.objectContaining({ method: "GET" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("총 2개의 포스트")).toBeInTheDocument();
    });
    expect(window.location.search).toBe("?tag=astro");
    expect(astroTagButton).toHaveAttribute("aria-pressed", "true");
    expect(astroTagButton.className).toContain("blog-filter-chip");
    expect(astroTagButton.className).toContain("select-none");
    expect(astroTagButton.className).toContain("bg-sky-200/85");
    expect(astroTagButton.className).toContain("text-sky-950");
    expect(astroTagButton.className).not.toContain("dark:bg-sky-400/24");
    expect(astroTagButton.className).not.toContain("dark:border-sky-300/55");
    expect(astroTagButton.className).not.toContain("dark:text-sky-50");
    expect(astroTagButton.className).not.toContain("bg-slate-100/92");
    expect(astroTagButton.className).not.toContain("text-foreground/80");
    expect(astroTagButton.className).not.toContain("border-white/80");
    expect(
      screen.queryByRole("link", { name: /React Patterns 읽기/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("포스트 검색"), {
      target: { value: "layouts" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("query=layouts"),
        expect.objectContaining({ method: "GET" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("총 1개의 포스트")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Astro Layouts 읽기/ })).toBeInTheDocument();
  });

  it("lets admin viewers switch visibility and sorting", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createSummaryPayload([posts[1]], {
            totalCount: 1,
            tagFilters: [{ slug: "react", count: 1 }],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createSummaryPayload([posts[0], posts[1], posts[2]], {
            totalCount: 3,
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createSummaryPayload([posts[0], posts[2], posts[1]], {
            totalCount: 3,
          }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BlogArchiveFilters
        initialSelectedTags={[]}
        initialQuery=""
        initialSort="latest"
        initialVisibility="all"
        isAdminViewer
        initialPosts={posts}
        initialHasMore={false}
        initialOffset={posts.length}
        initialTotalCount={posts.length}
        initialVisibilityCounts={{ all: 9, public: 8, private: 1 }}
        tagFilters={tagFilters}
        writeHref="/admin/posts/new"
      />,
    );

    expect(screen.getByRole("button", { name: "공개 (8)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비공개 (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "비공개 (1)" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("visibility=private"),
        expect.objectContaining({ method: "GET" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("총 1개의 포스트")).toBeInTheDocument();
    });
    expect(screen.getByText("Private")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^전체 \(/ }));
    fireEvent.change(screen.getByLabelText("정렬 방식"), {
      target: { value: "title" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("sort=title"),
        expect.objectContaining({ method: "GET" }),
      );
    });

    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((element) => element.textContent);

    expect(titles).toEqual(["Astro Intro", "Astro Layouts", "React Patterns"]);
  });

  it("requests the next archive batch when the infinite-scroll sentinel intersects", async () => {
    const observedTargets: Element[] = [];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          {
            slug: "next-post",
            title: "Next Post",
            description: "Loaded later",
            visibility: "public",
            tags: ["astro"],
            publishedAt: "2025-03-07T00:00:00.000Z",
            publishedAtValue: new Date("2025-03-07T00:00:00.000Z").valueOf(),
            commentCount: 0,
            readingLabel: "2 min read",
            coverImageSrc: "/images/empty-article-image.png",
          },
        ],
        nextOffset: 4,
        hasMore: false,
      }),
    }));

    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }

      callback: IntersectionObserverCallback;

      observe(target: Element) {
        observedTargets.push(target);
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }

      disconnect() {}

      unobserve() {}
    }

    const originalFetch = global.fetch;
    const originalObserver = global.IntersectionObserver;
    global.fetch = fetchMock as unknown as typeof fetch;
    global.IntersectionObserver =
      IntersectionObserverMock as unknown as typeof IntersectionObserver;

    try {
      render(
        <BlogArchiveFilters
          initialSelectedTags={[]}
          initialQuery=""
          initialSort="latest"
          initialVisibility="all"
          isAdminViewer={false}
          initialPosts={posts}
          initialHasMore
          initialOffset={posts.length}
          initialTotalCount={posts.length + 1}
          initialVisibilityCounts={{ all: 4, public: 3, private: 1 }}
          tagFilters={tagFilters}
          writeHref="/admin/posts/new"
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/\/internal-api\/posts\/summary\?/),
          expect.objectContaining({ method: "GET" }),
        );
      });
      expect(observedTargets.length).toBeGreaterThan(0);
      expect(
        screen.getByRole("link", { name: /Next Post 읽기/ }),
      ).toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
      global.IntersectionObserver = originalObserver;
    }
  });
});
