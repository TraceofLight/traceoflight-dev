import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  SaveIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PUBLIC_ICON_ACTION_CLASS,
  PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS,
} from "@/lib/ui-effects";

export interface SeriesAdminPost {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl?: string | null;
  orderIndex: number;
}

type FeedbackState = "info" | "pending" | "ok" | "error";

interface SeriesReorderListProps {
  defaultCoverImage: string;
  onMovePost: (slug: string, direction: "up" | "down") => void;
  onSaveOrder: () => void | Promise<void>;
  orderFeedback: {
    message: string;
    state: FeedbackState;
  };
  posts: SeriesAdminPost[];
  saving: boolean;
}

export default function SeriesReorderList({
  defaultCoverImage,
  onMovePost,
  onSaveOrder,
  orderFeedback,
  posts,
  saving,
}: SeriesReorderListProps) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            글 순서
          </h3>
        </div>
        <Button
          className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
          id="series-admin-save-order"
          disabled={saving || posts.length === 0}
          onClick={onSaveOrder}
          type="button"
          variant="outline"
        >
          <SaveIcon className="h-4 w-4" />글 순서 저장
        </Button>
      </div>

      {posts.length > 0 ? (
        <ol className="mt-5 grid gap-3" id="series-post-list">
          {posts.map((post, index) => {
            const previewText = post.excerpt.trim();

            return (
              <li
                className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm"
                data-post-slug={post.slug}
                data-series-order={index + 1}
                key={post.slug}
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <a
                    className="group grid grid-cols-[40px_minmax(0,1fr)_112px] items-center gap-3"
                    href={`/blog/${post.slug}`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-sm font-semibold text-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 space-y-1">
                      <strong className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{post.title}</span>
                      </strong>
                      <em className="line-clamp-2 text-sm not-italic text-muted-foreground">
                        {previewText.length > 0 ? previewText : "요약 없음"}
                      </em>
                    </span>
                    <img
                      alt={post.title}
                      className="aspect-[16/9] w-full rounded-xl border border-border/60 bg-muted object-cover"
                      loading="lazy"
                      src={post.coverImageUrl || defaultCoverImage}
                    />
                  </a>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      aria-label={`${post.title} 위로 이동`}
                      className={PUBLIC_ICON_ACTION_CLASS}
                      data-series-move="up"
                      disabled={index === 0}
                      onClick={() => onMovePost(post.slug, "up")}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={`${post.title} 아래로 이동`}
                      className={PUBLIC_ICON_ACTION_CLASS}
                      data-series-move="down"
                      disabled={index === posts.length - 1}
                      onClick={() => onMovePost(post.slug, "down")}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <ArrowDownIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-border/60 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
          아직 시리즈에 포함된 글이 없습니다.
        </div>
      )}

      <p
        className="mt-4 text-sm text-muted-foreground"
        data-state={orderFeedback.state}
        id="series-admin-order-feedback"
      >
        {orderFeedback.message}
      </p>
    </section>
  );
}
