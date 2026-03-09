import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PostAdminActions } from "@/components/public/PostAdminActions";

describe("PostAdminActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens and closes the delete confirmation dialog", async () => {
    render(<PostAdminActions adminPostSlug="draft-post" />);

    const deleteTrigger = screen.getByRole("button", { name: "삭제" });
    expect(deleteTrigger.className).toContain("border-red-200/80");
    expect(deleteTrigger.className).toContain("bg-white/88");
    expect(deleteTrigger.className).toContain("text-red-700");

    fireEvent.click(deleteTrigger);

    expect(await screen.findByText("게시글 삭제")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => {
      expect(screen.queryByText("게시글 삭제")).not.toBeInTheDocument();
    });
  });

  it("falls back to POST delete and calls the completion hook on success", async () => {
    const onDeleted = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostAdminActions adminPostSlug="draft-post" onDeleted={onDeleted} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "삭제 확인" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onDeleted).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/internal-api/posts/draft-post",
      { method: "DELETE" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/internal-api/posts/draft-post",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      },
    );
  });
});
