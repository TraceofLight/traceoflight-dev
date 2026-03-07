import type { AdminDraftListItem } from "./types";

function getTrimmedTitle(post: AdminDraftListItem): string {
  return post.title?.trim() || "제목 없음";
}

export function formatDateLabel(isoValue: string | null | undefined): string {
  if (!isoValue) return "";
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

export function buildDraftMetaLabel(post: AdminDraftListItem): string {
  return `${post.slug} · ${formatDateLabel(post.updated_at || post.created_at)}`;
}

export function normalizeDraftList(posts: unknown): AdminDraftListItem[] {
  if (!Array.isArray(posts)) return [];
  return post
    .filter((post): post is AdminDraftListItem =>
      Boolean(
        post &&
        typeof post === "object" &&
        (post as { status?: unknown }).status === "draft" &&
        typeof (post as { slug?: unknown }).slug === "string",
      ),
    )
    .sort((a, b) => {
      const titleOrder = getTrimmedTitle(a).localeCompare(
        getTrimmedTitle(b),
        "ko",
      );
      if (titleOrder !== 0) return titleOrder;
      return (a.slug || "").localeCompare(b.slug || "", "ko");
    });
}

export function renderDraftListEmpty(
  draftList: HTMLElement,
  message: string,
): void {
  draftList.innerHTML = `<li class="writer-draft-empty">${message}</li>`;
}

export function createDraftListItem(post: AdminDraftListItem): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "writer-draft-item";

  const main = document.createElement("div");
  main.className = "writer-draft-main";

  const titleButton = document.createElement("button");
  titleButton.type = "button";
  titleButton.className = "writer-draft-title";
  titleButton.dataset.slug = post.slug;
  titleButton.textContent = getTrimmedTitle(post);

  const meta = document.createElement("p");
  meta.className = "writer-draft-meta";
  meta.textContent = buildDraftMetaLabel(post);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "writer-draft-delete";
  removeButton.dataset.slug = post.slug;
  removeButton.setAttribute("aria-label", `${getTrimmedTitle(post)} 삭제`);
  removeButton.textContent = "x";

  main.append(titleButton, meta);
  item.append(main, removeButton);
  return item;
}

export function buildDraftQueryPath(
  currentHref: string,
  draftSlug: string | null,
): string {
  const nextUrl = new URL(currentHref);
  if (draftSlug) {
    nextUrl.searchParams.set("draft", draftSlug);
  } else {
    nextUrl.searchParams.delete("draft");
  }
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

export function readDraftSlugFromSearch(search: string): string {
  return new URLSearchParams(search).get("draft")?.trim() ?? "";
}
