import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ImagePlusIcon, LoaderCircleIcon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createUploadBundle } from "../../lib/admin/new-post-page/upload";
import SeriesReorderList from "./SeriesReorderList";
import type { SeriesAdminPost } from "./SeriesReorderList";

type FeedbackState = "info" | "pending" | "ok" | "error";

export interface SeriesAdminPanelSeries {
  slug: string;
  title: string;
  description: string;
  coverImageUrl?: string | null;
  defaultCoverImage: string;
  posts: SeriesAdminPost[];
}

interface SeriesAdminPanelProps {
  series: SeriesAdminPanelSeries;
}

async function readJsonSafe(
  response: Response | { json?: () => Promise<unknown> },
) {
  if (typeof response.json !== "function") {
    return null;
  }

  return response.json().catch(() => null);
}

function resolveErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const nextPayload = payload as Record<string, unknown>;
    const detail = nextPayload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
    const message = nextPayload.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return fallback;
}

function normalizeCoverImageUrl(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resequencePosts(posts: SeriesAdminPost[]) {
  return posts.map((post, index) => ({
    ...post,
    orderIndex: index + 1,
  }));
}

function movePost(
  posts: SeriesAdminPost[],
  slug: string,
  direction: "up" | "down",
) {
  const currentIndex = posts.findIndex((post) => post.slug === slug);
  if (currentIndex === -1) {
    return posts;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= posts.length) {
    return posts;
  }

  const nextPosts = [...posts];
  const [movedPost] = nextPosts.splice(currentIndex, 1);
  nextPosts.splice(targetIndex, 0, movedPost);
  return resequencePosts(nextPosts);
}

export function SeriesAdminPanel({ series }: SeriesAdminPanelProps) {
  const seriesSlug = series.slug;
  const seriesTitle = series.title;
  const defaultCoverImage = series.defaultCoverImage;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(series.description);
  const [coverImageUrl, setCoverImageUrl] = useState(
    series.coverImageUrl ?? "",
  );
  const [orderedPosts, setOrderedPosts] = useState(() =>
    resequencePosts(
      [...series.posts].sort(
        (left, right) => left.orderIndex - right.orderIndex,
      ),
    ),
  );
  const [metaFeedback, setMetaFeedback] = useState<{
    message: string;
    state: FeedbackState;
  }>({
    message: "",
    state: "info",
  });
  const [orderFeedback, setOrderFeedback] = useState<{
    message: string;
    state: FeedbackState;
  }>({
    message: "",
    state: "info",
  });
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const heroDescription = document.querySelector("#series-hero-description");
    if (heroDescription instanceof HTMLElement) {
      heroDescription.textContent = description;
    }

    const heroImage = document.querySelector("#series-hero-cover-image");
    if (heroImage instanceof HTMLImageElement) {
      heroImage.src =
        normalizeCoverImageUrl(coverImageUrl) ?? defaultCoverImage;
    }

    const startLink = document.querySelector("#series-start-link");
    if (startLink instanceof HTMLAnchorElement && orderedPosts[0]) {
      startLink.href = `/blog/${orderedPosts[0].slug}`;
    }
  }, [coverImageUrl, defaultCoverImage, description, orderedPosts]);

  function openCoverFilePicker() {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }

  async function uploadCover(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMetaFeedback({
        message: "이미지 파일만 업로드할 수 있습니다.",
        state: "error",
      });
      return;
    }

    setUploadingCover(true);
    setMetaFeedback({
      message: "시리즈 썸네일을 업로드하는 중입니다...",
      state: "pending",
    });

    try {
      const mediaBaseUrl = `${window.location.origin}/media`;
      const uploadBundle = await createUploadBundle(file, mediaBaseUrl);
      setCoverImageUrl(uploadBundle.mediaUrl);
      setMetaFeedback({
        message: "업로드가 완료되었습니다. 저장 버튼으로 반영하세요.",
        state: "ok",
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "썸네일 업로드에 실패했습니다.";
      setMetaFeedback({ message, state: "error" });
    } finally {
      setUploadingCover(false);
      setDragActive(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleMetaSave() {
    const normalizedDescription = description.trim();
    if (!normalizedDescription) {
      setMetaFeedback({
        message: "시리즈 설명을 입력해 주세요.",
        state: "error",
      });
      return;
    }

    const normalizedCoverImageUrl = normalizeCoverImageUrl(coverImageUrl);
    if (
      typeof normalizedCoverImageUrl === "string" &&
      normalizedCoverImageUrl.length > 500
    ) {
      setMetaFeedback({
        message: "썸네일 URL은 500자 이하여야 합니다.",
        state: "error",
      });
      return;
    }

    setSavingMeta(true);
    setMetaFeedback({
      message: "시리즈 정보를 저장하는 중입니다...",
      state: "pending",
    });

    try {
      const response = await fetch(
        `/internal-api/series/${encodeURIComponent(seriesSlug)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug: seriesSlug,
            title: seriesTitle,
            description: normalizedDescription,
            cover_image_url: normalizedCoverImageUrl,
          }),
        },
      );

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setMetaFeedback({
          message: resolveErrorMessage(payload, "시리즈 저장에 실패했습니다."),
          state: "error",
        });
        return;
      }

      const nextPayload = (payload ?? {}) as Record<string, unknown>;
      const nextDescription =
        typeof nextPayload.description === "string" &&
        nextPayload.description.trim()
          ? nextPayload.description.trim()
          : normalizedDescription;
      const nextCoverImageUrl =
        typeof nextPayload.cover_image_url === "string"
          ? nextPayload.cover_image_url.trim()
          : normalizedCoverImageUrl;

      setDescription(nextDescription);
      setCoverImageUrl(nextCoverImageUrl ?? "");
      setMetaFeedback({
        message: "시리즈 정보가 저장되었습니다.",
        state: "ok",
      });
    } catch {
      setMetaFeedback({
        message: "네트워크 오류로 시리즈 저장에 실패했습니다.",
        state: "error",
      });
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleOrderSave() {
    setSavingOrder(true);
    setOrderFeedback({
      message: "글 순서를 저장하는 중입니다...",
      state: "pending",
    });

    try {
      const response = await fetch(
        `/internal-api/series/${encodeURIComponent(seriesSlug)}/posts`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            post_slugs: orderedPosts.map((post) => post.slug),
          }),
        },
      );

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setOrderFeedback({
          message: resolveErrorMessage(payload, "글 순서 저장에 실패했습니다."),
          state: "error",
        });
        return;
      }

      setOrderFeedback({
        message: "글 순서가 저장되었습니다.",
        state: "ok",
      });
    } catch {
      setOrderFeedback({
        message: "네트워크 오류로 순서 저장에 실패했습니다.",
        state: "error",
      });
    } finally {
      setSavingOrder(false);
    }
  }

  function handleMovePost(slug: string, direction: "up" | "down") {
    setOrderedPosts((current) => movePost(current, slug, direction));
    setOrderFeedback({
      message: "순서를 변경했습니다. 저장 버튼으로 반영하세요.",
      state: "info",
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void uploadCover(event.dataTransfer.files?.[0] ?? null);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    void uploadCover(event.target.files?.[0] ?? null);
  }

  return (
    <div className="grid gap-6">
      <section
        className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-6"
        data-series-slug={seriesSlug}
        id="series-admin-panel"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              시리즈 관리
            </h2>
          </div>
          <Button
            id="series-admin-save-meta"
            disabled={savingMeta}
            onClick={handleMetaSave}
            type="button"
          >
            {savingMeta ? (
              <LoaderCircleIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SaveIcon className="h-4 w-4" />
            )}
            저장
          </Button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-2">
            <Label htmlFor="series-admin-description">설명</Label>
            <textarea
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              id="series-admin-description"
              maxLength={300}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              value={description}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="series-admin-cover-image-url">썸네일 URL</Label>
            <div
              className={cn(
                "grid gap-4 rounded-2xl border border-dashed border-border/60 bg-background/70 p-4 transition-colors",
                dragActive && "border-primary bg-primary/5",
              )}
              onDragEnter={() => setDragActive(true)}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <Input
                id="series-admin-cover-image-url"
                onChange={(event) => setCoverImageUrl(event.target.value)}
                placeholder="https://..."
                type="url"
                value={coverImageUrl}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  id="series-admin-cover-upload-trigger"
                  disabled={uploadingCover}
                  onClick={openCoverFilePicker}
                  type="button"
                  variant="outline"
                >
                  {uploadingCover ? (
                    <LoaderCircleIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlusIcon className="h-4 w-4" />
                  )}
                  파일 업로드
                </Button>
                <p className="text-sm text-muted-foreground">
                  이미지를 드래그/드롭하거나 업로드 버튼으로 추가하세요.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <img
                  alt={`${seriesTitle} cover preview`}
                  className="h-20 w-28 rounded-xl border border-border/60 bg-muted object-cover"
                  src={
                    normalizeCoverImageUrl(coverImageUrl) ?? defaultCoverImage
                  }
                />
              </div>
              <Label
                className="sr-only"
                htmlFor="series-admin-cover-upload-input"
              >
                시리즈 썸네일 업로드
              </Label>
              <Input
                accept="image/*"
                className="sr-only"
                id="series-admin-cover-upload-input"
                onChange={handleFileInputChange}
                ref={fileInputRef}
                type="file"
              />
            </div>
          </div>
        </div>

        <p
          className="mt-4 text-sm text-muted-foreground"
          data-state={metaFeedback.state}
          id="series-admin-meta-feedback"
        >
          {metaFeedback.message}
        </p>
      </section>

      <SeriesReorderList
        defaultCoverImage={defaultCoverImage}
        onMovePost={handleMovePost}
        onSaveOrder={handleOrderSave}
        orderFeedback={orderFeedback}
        posts={orderedPosts}
        saving={savingOrder}
      />
    </div>
  );
}

export default SeriesAdminPanel;
