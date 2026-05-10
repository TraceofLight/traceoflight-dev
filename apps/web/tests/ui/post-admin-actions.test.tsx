import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PostAdminActions } from "@/components/public/PostAdminActions";

describe("PostAdminActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens and closes the delete confirmation dialog", async () => {
    render(<PostAdminActions adminPostSlug="draft-post" />);

    const editLink = screen.getByRole("link", { name: "수정" });
    const deleteTrigger = screen.getByRole("button", { name: "삭제" });
    expect(editLink.className).toContain("border-info-soft");
    expect(editLink.className).toContain("text-primary");
    expect(editLink.className).toContain("px-5");
    expect(editLink.className).toContain("text-sm");
    expect(deleteTrigger.className).toContain("border-destructive/50");
    expect(deleteTrigger.className).toContain("text-destructive");
    expect(deleteTrigger.className).toContain("px-5");
    expect(deleteTrigger.className).toContain("text-sm");

    fireEvent.click(deleteTrigger);

    expect(await screen.findByText("게시글 삭제")).toBeInTheDocument();
    const cancelButton = screen.getByRole("button", { name: "취소" });
    const confirmButton = screen.getByRole("button", { name: "삭제 확인" });
    expect(cancelButton.className).toContain("border-surface-border");
    expect(cancelButton.className).toContain("bg-surface-soft");
    expect(cancelButton.className).toContain("hover:bg-surface-strong");
    expect(cancelButton.className).toContain("hover:text-foreground");
    expect(confirmButton.className).toContain("border-destructive/50");
    expect(confirmButton.className).toContain("bg-surface");
    expect(confirmButton.className).toContain("text-destructive");
    expect(confirmButton.className).toContain("hover:bg-destructive-soft");
    expect(confirmButton.className).toContain("hover:border-destructive");

    fireEvent.click(cancelButton);

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

  it("replaces edit and delete controls with retranslation for translated locales", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);

    render(<PostAdminActions adminPostSlug="translated-post" locale="en" />);

    expect(screen.queryByRole("link", { name: "수정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();

    const retranslateButton = screen.getByRole("button", { name: "재번역" });
    fireEvent.click(retranslateButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal-api/posts/translated-post/retranslate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: "en" }),
      },
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "번역 중" })).toBeDisabled();
    });
    expect(screen.queryByText("번역이 진행 중입니다.")).not.toBeInTheDocument();
  });

  it("keeps the in-progress button disabled after retranslation is queued", async () => {
    let resolveFetch!: (value: { ok: boolean; status: number }) => void;
    const fetchPromise = new Promise<{ ok: boolean; status: number }>(
      (resolve) => {
        resolveFetch = resolve;
      },
    );
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchMock);

    render(<PostAdminActions adminPostSlug="translated-post" locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "재번역" }));

    const pendingButton = await screen.findByRole("button", {
      name: "번역 중",
    });
    expect(pendingButton).toBeDisabled();
    expect(screen.queryByText("번역 중...")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "재번역" }),
    ).not.toBeInTheDocument();

    resolveFetch({ ok: true, status: 202 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "번역 중" })).toBeDisabled();
    });
    expect(screen.queryByText("번역이 진행 중입니다.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "재번역" }),
    ).not.toBeInTheDocument();
  });

  it("shows stale translated posts as in-progress on first render", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostAdminActions
        adminPostSlug="translated-post"
        initialTranslationStatus="stale"
        locale="en"
      />,
    );

    expect(screen.getByRole("button", { name: "번역 중" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "재번역" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("syncs the in-progress state when a reused island receives a stale post", () => {
    const { rerender } = render(
      <PostAdminActions
        adminPostSlug="synced-post"
        initialTranslationStatus="synced"
        locale="en"
      />,
    );

    expect(screen.getByRole("button", { name: "재번역" })).toBeEnabled();

    rerender(
      <PostAdminActions
        adminPostSlug="stale-post"
        initialTranslationStatus="stale"
        locale="en"
      />,
    );

    expect(screen.getByRole("button", { name: "번역 중" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "재번역" }),
    ).not.toBeInTheDocument();
  });
});
