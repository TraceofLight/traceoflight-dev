import { Button } from "@/components/ui/button";
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
  onReply: (comment: PostCommentItem) => void;
  onEdit: (comment: PostCommentItem) => void;
  onDelete: (comment: PostCommentItem) => void;
};

function CommentActions({
  comment,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: PostCommentItem;
  onReply: (comment: PostCommentItem) => void;
  onEdit: (comment: PostCommentItem) => void;
  onDelete: (comment: PostCommentItem) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {comment.can_reply ? (
        <Button
          className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
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
          onClick={() => onEdit(comment)}
          type="button"
          variant="outline"
        >
          수정
        </Button>
      ) : null}
      <Button
        className={PUBLIC_DANGER_OUTLINE_ACTION_CLASS}
        onClick={() => onDelete(comment)}
        type="button"
        variant="outline"
      >
        삭제
      </Button>
    </div>
  );
}

function CommentCard({
  comment,
  compact = false,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: PostCommentItem;
  compact?: boolean;
  onReply: (comment: PostCommentItem) => void;
  onEdit: (comment: PostCommentItem) => void;
  onDelete: (comment: PostCommentItem) => void;
}) {
  return (
    <article className={`grid gap-3 p-4 ${compact ? PUBLIC_PANEL_SURFACE_SOFT_CLASS : PUBLIC_PANEL_SURFACE_CLASS}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <strong className="text-sm font-semibold text-foreground">{comment.author_name}</strong>
          {comment.reply_to_author_name ? (
            <p className="text-xs text-muted-foreground">@{comment.reply_to_author_name}</p>
          ) : null}
        </div>
        <CommentActions comment={comment} onDelete={onDelete} onEdit={onEdit} onReply={onReply} />
      </div>
      <p className="text-sm leading-7 text-foreground/90">{comment.body}</p>
    </article>
  );
}

export function PostCommentThread({
  items,
  onReply,
  onEdit,
  onDelete,
}: PostCommentThreadProps) {
  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <section className="grid gap-3" key={item.id}>
          <CommentCard comment={item} onDelete={onDelete} onEdit={onEdit} onReply={onReply} />
          {item.replies.length > 0 ? (
            <div className="grid gap-3 pl-5 sm:pl-8">
              {item.replies.map((reply) => (
                <CommentCard compact comment={reply} key={reply.id} onDelete={onDelete} onEdit={onEdit} onReply={onReply} />
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export default PostCommentThread;
