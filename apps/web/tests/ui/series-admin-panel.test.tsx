import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SeriesAdminPanel } from "@/components/public/SeriesAdminPanel";

const series = {
  coverImageUrl: "",
  defaultCoverImage: "/images/empty-series-image.png",
  description: "초기 설명",
  posts: [
    {
      slug: "series-intro",
      title: "Intro",
      excerpt: "첫 글",
      coverImageUrl: "",
      orderIndex: 1,
    },
    {
      slug: "lighting-pass",
      title: "Lighting Pass",
      excerpt: "두 번째 글",
      coverImageUrl: "",
      orderIndex: 2,
    },
  ],
  title: "Graphics Lab",
  slug: "graphics-lab",
};

describe("SeriesAdminPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves series metadata through the public route admin panel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        description: "업데이트된 설명",
        cover_image_url: "",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<SeriesAdminPanel series={series} />);

    fireEvent.change(screen.getByLabelText("설명"), {
      target: { value: "업데이트된 설명" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/internal-api/series/graphics-lab",
        expect.objectContaining({
          method: "PUT",
        }),
      );
    });
  });

  it("opens the cover upload picker from the upload trigger", () => {
    render(<SeriesAdminPanel series={series} />);

    const uploadInput = screen.getByLabelText("시리즈 썸네일 업로드");
    const showPicker = vi.fn();
    Object.defineProperty(uploadInput, "showPicker", {
      configurable: true,
      value: showPicker,
    });

    fireEvent.click(screen.getByRole("button", { name: "파일 업로드" }));

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("saves reordered post slugs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<SeriesAdminPanel series={series} />);

    fireEvent.click(screen.getByRole("button", { name: "Intro 아래로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "글 순서 저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/internal-api/series/graphics-lab/posts",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            post_slugs: ["lighting-pass", "series-intro"],
          }),
        }),
      );
    });
  });
});
