import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { action, field, surface } from "@/lib/ui";

type CommentVisibility = "public" | "private";
type ComposerMode = "create" | "reply" | "edit";

type PostCommentComposerProps = {
  mode: ComposerMode;
  body: string;
  visibility: CommentVisibility;
  authorName: string;
  password: string;
  isAdminViewer: boolean;
  busy: boolean;
  replyTargetLabel: string;
  editTargetLabel: string;
  onBodyChange: (value: string) => void;
  onVisibilityChange: (value: CommentVisibility) => void;
  onAuthorNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onCancelAction: () => void;
  onSubmit: () => void;
};

export function PostCommentComposer({
  mode,
  body,
  visibility,
  authorName,
  password,
  isAdminViewer,
  busy,
  replyTargetLabel,
  editTargetLabel,
  onBodyChange,
  onVisibilityChange,
  onAuthorNameChange,
  onPasswordChange,
  onCancelAction,
  onSubmit,
}: PostCommentComposerProps) {
  const isEditing = mode === "edit";
  const helperLabel = isEditing ? editTargetLabel : replyTargetLabel;
  const submitLabel = busy ? "저장 중..." : isEditing ? "댓글 수정" : "댓글 등록";
  const cancelLabel = isEditing ? "수정 취소" : "답글 취소";

  return (
    <section className={`grid gap-4 p-5 ${surface({ kind: "panel" })}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {isEditing ? "댓글 수정" : "댓글 작성"}
          </h2>
          {helperLabel ? (
            <p className="text-sm text-muted-foreground">{helperLabel}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              게시글에 대한 의견을 남겨 주세요.
            </p>
          )}
        </div>
        {helperLabel ? (
          <Button
            className={action({ variant: "primaryOutline", size: "md" })}
            onClick={onCancelAction}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
        ) : null}
      </div>

      {isAdminViewer ? (
        <div className={field({ kind: "display" })}>TraceofLight로 작성</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="comment-author-name">
              이름
            </label>
            <Input
              id="comment-author-name"
              disabled={isEditing}
              onChange={(event) => onAuthorNameChange(event.target.value)}
              placeholder="이름"
              value={authorName}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="comment-password">
              비밀번호
            </label>
            <Input
              id="comment-password"
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="수정/삭제용 비밀번호"
              type="password"
              value={password}
            />
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor="comment-visibility">
          공개 범위
        </label>
        <select
          className={`${field({ kind: "input" })} text-sm`}
          id="comment-visibility"
          onChange={(event) => onVisibilityChange(event.target.value as CommentVisibility)}
          value={visibility}
        >
          <option value="public">공개</option>
          <option value="private">비공개</option>
        </select>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor="comment-body">
          댓글 내용
        </label>
        <textarea
          className="min-h-28 rounded-[1.5rem] border border-surface-border bg-surface px-4 py-3 text-sm shadow-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          id="comment-body"
          onChange={(event) => onBodyChange(event.target.value)}
          value={body}
        />
      </div>

      <div className="flex justify-end">
        <Button
          className={action({ variant: "primaryOutline", size: "md" })}
          disabled={busy}
          onClick={onSubmit}
          type="button"
          variant="outline"
        >
          {submitLabel}
        </Button>
      </div>
    </section>
  );
}

export default PostCommentComposer;
