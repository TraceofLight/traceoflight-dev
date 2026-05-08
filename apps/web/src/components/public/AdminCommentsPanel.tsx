import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { deleteAdminComment, fetchAdminComments } from "@/lib/admin/comments-client";
import type { AdminCommentFeed } from "@/lib/post-comments";
import { action, surface } from "@/lib/ui";

type FeedbackState = "info" | "error";

const emptyFeed: AdminCommentFeed = {
  total_count: 0,
  items: [],
};

export function AdminCommentsPanel() {
  const [feed, setFeed] = useState<AdminCommentFeed>(emptyFeed);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<FeedbackState>("info");

  async function loadFeed() {
    try {
      const nextFeed = await fetchAdminComments();
      setFeed({
        total_count:
          typeof nextFeed.total_count === "number" ? nextFeed.total_count : 0,
        items: Array.isArray(nextFeed.items) ? nextFeed.items : [],
      });
      setMessage("");
      setState("info");
    } catch {
      setMessage("댓글 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setState("error");
    }
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  return (
    <section className={`grid gap-5 p-5 sm:p-6 ${surface({ kind: "section", tone: "strong" })}`} id="admin-comments-panel">
      <div className={`grid gap-3 p-4 ${surface({ kind: "panel", tone: "soft" })}`}>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Comment Review
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            최근 댓글 검토
          </h2>
          <p className="text-sm text-muted-foreground">
            관리자와 일반 사용자 댓글을 최신순으로 검토하고 바로 삭제할 수 있습니다.
          </p>
        </div>
      </div>

      {message ? (
        <div
          className={state === "error"
            ? "rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            : "rounded-[1.25rem] border border-surface-border bg-surface-soft px-4 py-3 text-sm text-muted-foreground"}
        >
          {message}
        </div>
      ) : null}

      <div
        className={`grid max-h-[28rem] gap-3 overflow-y-auto p-1 ${surface({ kind: "panel" })}`}
        data-testid="admin-comments-list"
      >
        {feed.items.map((item) => (
          <article className={`grid gap-3 p-4 ${surface({ kind: "panel", tone: "soft" })}`} key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <strong className="text-sm font-semibold text-foreground">{item.author_name}</strong>
                <p className="text-xs text-muted-foreground">
                  {item.post_title} · {item.visibility} · {item.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className={action({ variant: "surface", size: "md" })}
                  onClick={() => {
                    void deleteAdminComment(item.id).then(loadFeed);
                  }}
                  type="button"
                  variant="outline"
                >
                  삭제
                </Button>
                <Button asChild className={action({ variant: "surface", size: "md" })} variant="outline">
                  <a href={`/blog/${item.post_slug}`} target="_blank">
                    게시글로 이동
                  </a>
                </Button>
              </div>
            </div>
            <p className="text-sm leading-7 text-foreground/90">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default AdminCommentsPanel;
