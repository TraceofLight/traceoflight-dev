import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminCommentsPanel } from "@/components/public/AdminCommentsPanel";

describe("AdminCommentsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a scrollable newest-first admin review list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_count: 2,
        items: [
          {
            id: "comment-2",
            root_comment_id: null,
            reply_to_comment_id: null,
            author_name: "@TraceofLight",
            author_type: "admin",
            visibility: "public",
            status: "active",
            body: "latest admin comment",
            can_reply: true,
            created_at: "2026-03-13T01:00:00Z",
            updated_at: "2026-03-13T01:00:00Z",
            post_slug: "post-b",
            post_title: "Post B",
            is_reply: false,
          },
          {
            id: "comment-1",
            root_comment_id: null,
            reply_to_comment_id: null,
            author_name: "GuestA",
            author_type: "guest",
            visibility: "private",
            status: "deleted",
            body: "삭제된 댓글입니다.",
            can_reply: false,
            created_at: "2026-03-13T00:00:00Z",
            updated_at: "2026-03-13T00:00:00Z",
            post_slug: "post-a",
            post_title: "Post A",
            is_reply: false,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminCommentsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Comment Review")).toBeInTheDocument();
    });

    const list = screen.getByTestId("admin-comments-list");
    expect(list.className).toContain("overflow-y-auto");
    expect(screen.getByText("latest admin comment")).toBeInTheDocument();
    expect(screen.getByText("삭제된 댓글입니다.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "삭제" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "게시글로 이동" })).toHaveLength(2);
  });

  it("shows an inline error when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    render(<AdminCommentsPanel />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText("댓글 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
  });
});
