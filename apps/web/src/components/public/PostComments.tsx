import { useState, useTransition } from "react";

import type {
  PostCommentDeletePayload,
  PostCommentItem,
  PostCommentThreadList,
  PostCommentUpdatePayload,
} from "@/lib/post-comments";

import PostCommentComposer from "./PostCommentComposer";
import PostCommentPasswordDialog from "./PostCommentPasswordDialog";
import PostCommentThread from "./PostCommentThread";

const DEFAULT_GUEST_AUTHOR_NAME = "ㅇㅇ";

type PostCommentsProps = {
  initialComments: PostCommentThreadList;
  isAdminViewer: boolean;
  postSlug: string;
};

export function PostComments({
  initialComments,
  isAdminViewer,
  postSlug,
}: PostCommentsProps) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState(DEFAULT_GUEST_AUTHOR_NAME);
  const [password, setPassword] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [replyTarget, setReplyTarget] = useState<PostCommentItem | null>(null);
  const [editTarget, setEditTarget] = useState<PostCommentItem | null>(null);
  const [busy, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<PostCommentItem | null>(null);
  const [feedback, setFeedback] = useState("");

  function resetComposer() {
    setAuthorName(DEFAULT_GUEST_AUTHOR_NAME);
    setBody("");
    setPassword("");
    setVisibility("public");
    setReplyTarget(null);
    setEditTarget(null);
    setFeedback("");
  }

  async function resolveResponseMessage(response: Response, fallbackMessage: string) {
    try {
      const payload = (await response.json()) as { detail?: string; message?: string };
      if (typeof payload.detail === "string" && payload.detail.trim()) {
        return payload.detail.trim();
      }
      if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message.trim();
      }
    } catch {
      return fallbackMessage;
    }
    return fallbackMessage;
  }

  async function refreshComments() {
    const response = await fetch(`/internal-api/posts/${encodeURIComponent(postSlug)}/comments`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as PostCommentThreadList;
    startTransition(() => {
      setComments(payload);
    });
  }

  async function handleSubmit() {
    setFeedback("");
    if (editTarget) {
      const payload: PostCommentUpdatePayload = {
        visibility,
        body,
        ...(isAdminViewer ? {} : { password }),
      };
      const response = await fetch(`/internal-api/comments/${encodeURIComponent(editTarget.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setFeedback(await resolveResponseMessage(response, "댓글 수정에 실패했습니다."));
        return;
      }
      resetComposer();
      await refreshComments();
      return;
    }

    const payload = {
      visibility,
      body,
      ...(isAdminViewer ? {} : { author_name: authorName, password }),
      ...(replyTarget ? { reply_to_comment_id: replyTarget.id } : {}),
    };
    const response = await fetch(`/internal-api/posts/${encodeURIComponent(postSlug)}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setFeedback(await resolveResponseMessage(response, "댓글 등록에 실패했습니다."));
      return;
    }
    resetComposer();
    await refreshComments();
  }

  async function handleDelete(comment: PostCommentItem, nextPassword?: string) {
    const payload: PostCommentDeletePayload = isAdminViewer ? {} : { password: nextPassword };
    const response = await fetch(`/internal-api/comments/${encodeURIComponent(comment.id)}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setFeedback(await resolveResponseMessage(response, "댓글 삭제에 실패했습니다."));
      return;
    }
    setDeleteTarget(null);
    setFeedback("");
    await refreshComments();
  }

  const replyTargetLabel = replyTarget
    ? `${replyTarget.author_name}에게 답글 작성 중`
    : "";
  const editTargetLabel = editTarget
    ? `${editTarget.author_name} 댓글 수정 중`
    : "";
  const composerMode = editTarget ? "edit" : replyTarget ? "reply" : "create";

  return (
    <section className="mt-10 grid gap-5" id="post-comments">
      <PostCommentComposer
        authorName={authorName}
        body={body}
        busy={busy}
        editTargetLabel={editTargetLabel}
        isAdminViewer={isAdminViewer}
        mode={composerMode}
        onAuthorNameChange={setAuthorName}
        onBodyChange={setBody}
        onCancelAction={resetComposer}
        onPasswordChange={setPassword}
        onSubmit={() => {
          void handleSubmit();
        }}
        onVisibilityChange={setVisibility}
        password={password}
        replyTargetLabel={replyTargetLabel}
        visibility={visibility}
      />

      {feedback ? (
        <p className="rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {feedback}
        </p>
      ) : null}

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          댓글 {comments.comment_count}개
        </h2>
      </div>

      <PostCommentThread
        isAdminViewer={isAdminViewer}
        items={comments.items}
        onDelete={(comment) => {
          if (isAdminViewer) {
            void handleDelete(comment);
            return;
          }
          setDeleteTarget(comment);
        }}
        onEdit={(comment) => {
          setFeedback("");
          setDeleteTarget(null);
          setReplyTarget(null);
          setEditTarget(comment);
          setAuthorName(comment.author_name);
          setPassword("");
          setVisibility(comment.visibility);
          setBody(
            !isAdminViewer && comment.visibility === "private"
              ? ""
              : comment.status === "deleted"
              ? ""
              : comment.body,
          );
        }}
        onReply={(comment) => {
          setFeedback("");
          setDeleteTarget(null);
          setEditTarget(null);
          setReplyTarget(comment);
          setBody("");
          setPassword("");
          setVisibility("public");
        }}
      />

      {deleteTarget ? (
        <PostCommentPasswordDialog
          actionLabel="댓글 삭제"
          description="작성할 때 사용한 비밀번호를 입력해 주세요."
          onClose={() => setDeleteTarget(null)}
          onConfirm={async (nextPassword) => {
            await handleDelete(deleteTarget, nextPassword);
          }}
          open={Boolean(deleteTarget)}
        />
      ) : null}
    </section>
  );
}

export default PostComments;
