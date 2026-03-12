import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PUBLIC_SURFACE_ACTION_CLASS } from "@/lib/ui-effects";
import type { ProjectItem } from "@/lib/projects";
import CollectionOrderList, { type OrderableCollectionItem } from "./CollectionOrderList";

type FeedbackState = "info" | "pending" | "ok" | "error";

function resequenceItems(items: OrderableCollectionItem[]) {
  return [...items];
}

function moveItem(
  items: OrderableCollectionItem[],
  slug: string,
  direction: "up" | "down",
) {
  const currentIndex = items.findIndex((item) => item.slug === slug);
  if (currentIndex === -1) {
    return items;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [moved] = nextItems.splice(currentIndex, 1);
  nextItems.splice(targetIndex, 0, moved);
  return resequenceItems(nextItems);
}

function toOrderItems(projects: ProjectItem[]): OrderableCollectionItem[] {
  return projects.map((project) => ({
    slug: project.slug,
    title: project.title,
    description: project.summary,
    coverImageUrl: project.coverImageUrl,
    href: `/projects/${project.slug}`,
  }));
}

interface ProjectOrderPanelProps {
  projects: ProjectItem[];
}

export function ProjectOrderPanel({ projects }: ProjectOrderPanelProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState(() => toOrderItems(projects));
  const [feedback, setFeedback] = useState<{ message: string; state: FeedbackState }>({
    message: "",
    state: "info",
  });

  async function handleSaveOrder() {
    setSaving(true);
    setFeedback({ message: "프로젝트 순서를 저장하는 중입니다...", state: "pending" });

    try {
      const response = await fetch("/internal-api/projects/order", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_slugs: items.map((item) => item.slug),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        setFeedback({
          message: detail.includes("unauthorized")
            ? "로그인 후 다시 시도해 주세요."
            : "프로젝트 순서 저장에 실패했습니다.",
          state: "error",
        });
        return;
      }

      setFeedback({
        message: "프로젝트 순서를 저장했습니다. 새 순서를 반영합니다...",
        state: "ok",
      });
      window.setTimeout(() => window.location.reload(), 500);
    } catch {
      setFeedback({
        message: "네트워크 오류로 프로젝트 순서 저장에 실패했습니다.",
        state: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className={PUBLIC_SURFACE_ACTION_CLASS} type="button" variant="outline">
          순서 조정
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        {feedback.message ? (
          <p
            className={`fixed right-6 top-6 z-[80] max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg ${
              feedback.state === "error"
                ? "border-red-200/80 bg-white/95 text-red-700"
                : feedback.state === "ok"
                  ? "border-sky-200/80 bg-white/95 text-sky-700"
                  : "border-white/80 bg-white/95 text-foreground/80"
            }`}
          >
            {feedback.message}
          </p>
        ) : null}
        <DialogHeader>
          <DialogTitle>프로젝트 순서 조정</DialogTitle>
          <DialogDescription>
            공개 Projects 목록에 노출되는 순서를 직접 조정합니다.
          </DialogDescription>
        </DialogHeader>
        <CollectionOrderList
          defaultCoverImage="/images/empty-series-image.png"
          emptyMessage="정렬할 프로젝트가 없습니다."
          itemLabel="프로젝트"
          items={items}
          onMoveItem={(slug, direction) => setItems((current) => moveItem(current, slug, direction))}
          onSaveOrder={handleSaveOrder}
          saveLabel="프로젝트 순서 저장"
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}

export default ProjectOrderPanel;
