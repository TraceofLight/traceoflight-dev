import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PUBLIC_ICON_ACTION_CLASS,
  PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS,
} from "@/lib/ui-effects";

export interface OrderableCollectionItem {
  slug: string;
  title: string;
  description: string;
  coverImageUrl?: string | null;
  href: string;
}

interface CollectionOrderListProps {
  defaultCoverImage: string;
  emptyMessage: string;
  footer?: ReactNode;
  items: OrderableCollectionItem[];
  itemLabel: string;
  onMoveItem: (slug: string, direction: "up" | "down") => void;
  onSaveOrder: () => void | Promise<void>;
  saveLabel: string;
  saving: boolean;
}

export default function CollectionOrderList({
  defaultCoverImage,
  emptyMessage,
  footer,
  items,
  itemLabel,
  onMoveItem,
  onSaveOrder,
  saveLabel,
  saving,
}: CollectionOrderListProps) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {itemLabel} 순서
          </h3>
        </div>
        <Button
          className={PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS}
          disabled={saving || items.length === 0}
          onClick={onSaveOrder}
          type="button"
          variant="outline"
        >
          <SaveIcon className="h-4 w-4" />
          {saveLabel}
        </Button>
      </div>

      {items.length > 0 ? (
        <ol className="mt-5 grid gap-3">
          {items.map((item, index) => (
            <li
              className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm"
              data-order-slug={item.slug}
              data-order-index={index + 1}
              key={item.slug}
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <a
                  className="group grid grid-cols-[40px_minmax(0,1fr)_112px] items-center gap-3"
                  href={item.href}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-sm font-semibold text-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 space-y-1">
                    <strong className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{item.title}</span>
                    </strong>
                    <em className="line-clamp-2 text-sm not-italic text-muted-foreground">
                      {item.description.trim().length > 0 ? item.description : "설명 없음"}
                    </em>
                  </span>
                  <img
                    alt={item.title}
                    className="aspect-[16/9] w-full rounded-xl border border-border/60 bg-muted object-cover"
                    loading="lazy"
                    src={item.coverImageUrl || defaultCoverImage}
                  />
                </a>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    aria-label={`${item.title} 위로 이동`}
                    className={PUBLIC_ICON_ACTION_CLASS}
                    data-order-move="up"
                    disabled={index === 0}
                    onClick={() => onMoveItem(item.slug, "up")}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={`${item.title} 아래로 이동`}
                    className={PUBLIC_ICON_ACTION_CLASS}
                    data-order-move="down"
                    disabled={index === items.length - 1}
                    onClick={() => onMoveItem(item.slug, "down")}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-border/60 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}

      {footer}
    </section>
  );
}
