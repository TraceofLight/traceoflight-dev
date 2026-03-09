import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

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
    readingLabel: "4 min read",
    coverImageSrc: "/images/empty-article-image.png",
  },
];

const tagFilters = [
  { slug: "astro", count: 2 },
  { slug: "react", count: 1 },
  { slug: "web", count: 1 },
];

describe("BlogArchiveFilters", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/blog");
  });

  it("filters by search and tag while syncing the tag query string", () => {
    render(
      <BlogArchiveFilters
        initialSelectedTags={[]}
        isAdminViewer={false}
        posts={posts}
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

    expect(screen.getByText("총 2개의 포스트")).toBeInTheDocument();
    expect(window.location.search).toBe("?tag=astro");
    expect(astroTagButton).toHaveAttribute("aria-pressed", "true");
    expect(astroTagButton.className).toContain("blog-filter-chip");
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

    expect(screen.getByText("총 1개의 포스트")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Astro Layouts 읽기/ }),
    ).toBeInTheDocument();
  });

  it("lets admin viewers switch visibility and sorting", () => {
    render(
      <BlogArchiveFilters
        initialSelectedTags={[]}
        isAdminViewer
        posts={posts}
        tagFilters={tagFilters}
        writeHref="/admin/posts/new"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "비공개 (1)" }));

    expect(screen.getByText("총 1개의 포스트")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "전체 (3)" }));
    fireEvent.change(screen.getByLabelText("정렬 방식"), {
      target: { value: "title" },
    });

    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((element) => element.textContent);

    expect(titles).toEqual(["Astro Intro", "Astro Layouts", "React Patterns"]);
  });
});
