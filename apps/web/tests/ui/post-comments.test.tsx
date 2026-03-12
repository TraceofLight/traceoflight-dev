import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PostComments } from "@/components/public/PostComments";
import type { PostCommentThreadList } from "@/lib/post-comments";

const initialComments: PostCommentThreadList = {
  comment_count: 3,
  items: [
    {
      id: "root-1",
      root_comment_id: null,
      reply_to_comment_id: null,
      author_name: "GuestA",
      author_type: "guest",
      visibility: "public",
      status: "active",
      body: "첫 댓글",
      can_reply: true,
      created_at: "2026-03-13T00:00:00Z",
      updated_at: "2026-03-13T00:00:00Z",
      replies: [
        {
          id: "reply-1",
          root_comment_id: "root-1",
          reply_to_comment_id: "root-1",
          author_name: "GuestB",
          author_type: "guest",
          visibility: "public",
          status: "active",
          body: "답글",
          can_reply: true,
          reply_to_author_name: "GuestA",
          created_at: "2026-03-13T00:10:00Z",
          updated_at: "2026-03-13T00:10:00Z",
        },
        {
          id: "reply-2",
          root_comment_id: "root-1",
          reply_to_comment_id: "reply-1",
          author_name: "TraceofLight",
          author_type: "guest",
          visibility: "private",
          status: "deleted",
          body: "삭제된 댓글입니다.",
          can_reply: false,
          reply_to_author_name: "TraceofLight",
          created_at: "2026-03-13T00:20:00Z",
          updated_at: "2026-03-13T00:20:00Z",
        },
      ],
    },
  ],
};

describe("PostComments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => initialComments,
    }));
  });

  it("renders guest composer fields and flat replies", () => {
    render(
      <PostComments
        initialComments={initialComments}
        isAdminViewer={false}
        postSlug="sample-post"
      />,
    );

    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveValue("ㅇㅇ");
    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.getByLabelText("공개 범위")).toBeInTheDocument();
    expect(screen.getByLabelText("댓글 내용")).toBeInTheDocument();
    expect(screen.getByText("댓글 3개")).toBeInTheDocument();
    expect(screen.getByText("첫 댓글")).toBeInTheDocument();
    expect(screen.getByText("@GuestA")).toBeInTheDocument();
    expect(screen.getByText("@TraceofLight")).toBeInTheDocument();
    expect(screen.queryByText("@@TraceofLight")).not.toBeInTheDocument();
    expect(screen.getByText("삭제된 댓글입니다.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "답글" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "삭제된 댓글에는 답글을 달 수 없습니다." })).toBeDisabled();
  });

  it("renders admin composer without guest credentials", () => {
    render(
      <PostComments
        initialComments={initialComments}
        isAdminViewer
        postSlug="sample-post"
      />,
    );

    expect(screen.queryByLabelText("이름")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.getByText("TraceofLight로 작성")).toBeInTheDocument();
    expect(screen.getByLabelText("댓글 내용")).toBeInTheDocument();
  });

  it("opens a reply composer targeted at the selected comment", () => {
    render(
      <PostComments
        initialComments={initialComments}
        isAdminViewer={false}
        postSlug="sample-post"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "답글" })[1]);

    expect(screen.getByText("GuestB에게 답글 작성 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "답글 취소" })).toBeInTheDocument();
  });

  it("submits guest comment edits with password verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => initialComments,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostComments
        initialComments={initialComments}
        isAdminViewer={false}
        postSlug="sample-post"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[1]);
    expect(screen.getByText("GuestB 댓글 수정 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "댓글 수정" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("댓글 내용"), {
      target: { value: "수정된 답글" },
    });
    fireEvent.click(screen.getByRole("button", { name: "댓글 수정" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/internal-api/comments/reply-1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      password: "secret123",
      visibility: "public",
      body: "수정된 답글",
    });
  });

  it("shows backend validation feedback when guest comment creation fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "비밀번호를 4자 이상 입력해 주세요." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostComments
        initialComments={initialComments}
        isAdminViewer={false}
        postSlug="sample-post"
      />,
    );

    fireEvent.change(screen.getByLabelText("댓글 내용"), {
      target: { value: "새 댓글" },
    });
    fireEvent.click(screen.getByRole("button", { name: "댓글 등록" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(await screen.findByText("비밀번호를 4자 이상 입력해 주세요.")).toBeInTheDocument();
  });

  it("submits admin comment edits without guest credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => initialComments,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostComments
        initialComments={initialComments}
        isAdminViewer
        postSlug="sample-post"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    expect(screen.getByText("GuestA 댓글 수정 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "댓글 수정" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("댓글 내용"), {
      target: { value: "관리자 수정 댓글" },
    });
    fireEvent.click(screen.getByRole("button", { name: "댓글 수정" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/internal-api/comments/root-1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      visibility: "public",
      body: "관리자 수정 댓글",
    });
  });
});
