import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SeriesOrderPanel } from "@/components/public/SeriesOrderPanel";

describe("SeriesOrderPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a fixed toast on save failure instead of inline feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ detail: "unknown series slugs: problemsolving" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SeriesOrderPanel
        series={[
          {
            id: "1",
            slug: "ProblemSolving",
            title: "PS",
            description: "desc",
            coverImageUrl: undefined,
            postCount: 1,
            createdAt: new Date("2026-03-12T00:00:00.000Z"),
            updatedAt: new Date("2026-03-12T00:00:00.000Z"),
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "순서 조정" }));
    fireEvent.click(await screen.findByRole("button", { name: "시리즈 순서 저장" }));

    expect(await screen.findByText("시리즈 순서 저장에 실패했습니다.")).toBeInTheDocument();
    expect(screen.getByText("시리즈 순서 저장에 실패했습니다.").className).toContain("fixed");
    expect(screen.getByText("시리즈 순서 저장에 실패했습니다.").className).toContain("top-6");
    expect(screen.getByText("시리즈 순서 저장에 실패했습니다.").className).toContain("right-6");
    expect(screen.queryByTestId("collection-order-feedback")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/internal-api/series/order",
        expect.objectContaining({
          method: "PUT",
        }),
      );
    });
  });
});
