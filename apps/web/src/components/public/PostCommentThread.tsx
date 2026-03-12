import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PostCommentItem, PostCommentThreadItem } from "@/lib/post-comments";
import {
  PUBLIC_DANGER_OUTLINE_ACTION_CLASS,
  PUBLIC_PANEL_SURFACE_CLASS,
  PUBLIC_PANEL_SURFACE_SOFT_CLASS,
  PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS,
} from "@/lib/ui-effects";

type PostCommentThreadProps = {
  items: PostCommentThreadItem[];
  isAdminViewer: boolean;
  editingCommentId: string | null;
  editBody: string;
  editPassword: string;
  editVisibility: "public" | "private";
  editFeedback: string;
  onReply: (comment: PostCommentItem) => void;
  onEdit: (comment: PostCommentItem) => void;
  onDelete: (comment: PostCommentItem) => void;
  onEditBodyChange: (value: string) => void;
  onEditPasswordChange: (value: string) => void;
  onEditVisibilityChange: (value: "public" | "private") => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
};

function CommentActions({
  comment,
  disabled = false,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: PostCommentItem;
  disabled?: boolean;
  onReply: (comment: PostCommentItem) => void;
  onEdit: (comment: PostCommentItem) => void;
  onDelete: (comment: PostCommentItem) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {comment.can_reply ? (
        <Button
          className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
          disabled={disabled}
          onClick={() => onReply(comment)}
          type="button"
          variant="outline"
        >
          답글
        </Button>
      ) : (
        <Button
          aria-label="삭제된 댓글에는 답글을 달 수 없습니다."
          className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
          disabled
          type="button"
          variant="outline"
        >
          답글
        </Button>
      )}
      {comment.status === "active" ? (
        <Button
          className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
          disabled={disabled}
          onClick={() => onEdit(comment)}
          type="button"
          variant="outline"
        >
          수정
        </Button>
      ) : null}
      <Button
        className={PUBLIC_DANGER_OUTLINE_ACTION_CLASS}
        disabled={disabled}
        onClick={() => onDelete(comment)}
        type="button"
        variant="outline"
      >
        삭제
      </Button>
    </div>
  );
}

function InlineEditCard({
  comment,
  compact = false,
  isAdminViewer,
  body,
  password,
  visibility,
  feedback,
  onBodyChange,
  onPasswordChange,
  onVisibilityChange,
  onCancel,
  onSave,
}: {
  comment: PostCommentItem;
  compact?: boolean;
  isAdminViewer: boolean;
  body: string;
  password: string;
  visibility: "public" | "private";
  feedback: string;
  onBodyChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onVisibilityChange: (value: "public" | "private") => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <article
      className={`grid gap-3 p-4 ${compact ? PUBLIC_PANEL_SURFACE_SOFT_CLASS : PUBLIC_PANEL_SURFACE_CLASS}`}
      data-testid={`comment-card-${comment.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <strong className="text-sm font-semibold text-foreground">{comment.author_name}</strong>
          {comment.reply_to_author_name ? (
            <p className="text-xs text-muted-foreground">@{comment.reply_to_author_name}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
            onClick={onSave}
            type="button"
            variant="outline"
          >
            저장
          </Button>
          <Button
            className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            취소
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor={`comment-edit-visibility-${comment.id}`}>
          공개 범위
        </label>
        <select
          className="h-11 rounded-2xl border border-white/80 bg-white/92 px-4 py-2 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
          id={`comment-edit-visibility-${comment.id}`}
          onChange={(event) => onVisibilityChange(event.target.value as "public" | "private")}
          value={visibility}
        >
          <option value="public">공개</option>
          <option value="private">비공개</option>
        </select>
      </div>
      {!isAdminViewer ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor={`comment-edit-password-${comment.id}`}>
            비밀번호
          </label>
          <Input
            id={`comment-edit-password-${comment.id}`}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="수정/삭제용 비밀번호"
            type="password"
            value={password}
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor={`comment-edit-body-${comment.id}`}>
          댓글 내용
        </label>
        <textarea
          className="min-h-28 rounded-[1.5rem] border border-white/80 bg-white/92 px-4 py-3 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          id={`comment-edit-body-${comment.id}`}
          onChange={(event) => onBodyChange(event.target.value)}
          value={body}
        />
      </div>
      {feedback ? (
        <p className="rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {feedback}
        </p>
      ) : null}
    </article>
  );
}

function CommentCard({
  comment,
  compact = false,
  disabled = false,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: PostCommentItem;
  compact?: boolean;
  disabled?: boolean;
  onReply: (comment: PostCommentItem) => void;
  onEdit: (comment: PostCommentItem) => void;
  onDelete: (comment: PostCommentItem) => void;
}) {
  return (
    <article
      className={`grid gap-3 p-4 ${compact ? PUBLIC_PANEL_SURFACE_SOFT_CLASS : PUBLIC_PANEL_SURFACE_CLASS}`}
      data-testid={`comment-card-${comment.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <strong className="text-sm font-semibold text-foreground">{comment.author_name}</strong>
          {comment.reply_to_author_name ? (
            <p className="text-xs text-muted-foreground">@{comment.reply_to_author_name}</p>
          ) : null}
        </div>
        <CommentActions
          comment={comment}
          disabled={disabled}
          onDelete={onDelete}
          onEdit={onEdit}
          onReply={onReply}
        />
      </div>
      <p className="text-sm leading-7 text-foreground/90">{comment.body}</p>
    </article>
  );
}

export function PostCommentThread({
  items,
  isAdminViewer,
  editingCommentId,
  editBody,
  editPassword,
  editVisibility,
  editFeedback,
  onReply,
  onEdit,
  onDelete,
  onEditBodyChange,
  onEditPasswordChange,
  onEditVisibilityChange,
  onCancelEdit,
  onSaveEdit,
}: PostCommentThreadProps) {
  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <section className="grid gap-3" key={item.id}>
          {editingCommentId === item.id ? (
            <InlineEditCard
              body={editBody}
              comment={item}
              feedback={editFeedback}
              isAdminViewer={isAdminViewer}
              onBodyChange={onEditBodyChange}
              onCancel={onCancelEdit}
              onPasswordChange={onEditPasswordChange}
              onSave={onSaveEdit}
              onVisibilityChange={onEditVisibilityChange}
              password={editPassword}
              visibility={editVisibility}
            />
          ) : (
            <CommentCard
              comment={item}
              disabled={editingCommentId !== null}
              onDelete={onDelete}
              onEdit={onEdit}
              onReply={onReply}
            />
          )}
          {item.replies.length > 0 ? (
            <div className="grid gap-3 pl-5 sm:pl-8">
              {item.replies.map((reply) => (
                editingCommentId === reply.id ? (
                  <InlineEditCard
                    body={editBody}
                    comment={reply}
                    compact
                    feedback={editFeedback}
                    isAdminViewer={isAdminViewer}
                    key={reply.id}
                    onBodyChange={onEditBodyChange}
                    onCancel={onCancelEdit}
                    onPasswordChange={onEditPasswordChange}
                    onSave={onSaveEdit}
                    onVisibilityChange={onEditVisibilityChange}
                    password={editPassword}
                    visibility={editVisibility}
                  />
                ) : (
                  <CommentCard
                    compact
                    comment={reply}
                    disabled={editingCommentId !== null}
                    key={reply.id}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onReply={onReply}
                  />
                )
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export default PostCommentThread;
