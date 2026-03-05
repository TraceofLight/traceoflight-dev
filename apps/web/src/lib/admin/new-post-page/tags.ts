import type { AdminTagOption } from "./types";

const TAG_NON_ALNUM_PATTERN = /[^a-z0-9-]+/g;
const TAG_MULTI_DASH_PATTERN = /-{2,}/g;
const TAG_SPLIT_PATTERN = /[,\n]/g;

export interface MetadataChipRailArgs {
  rail: HTMLElement;
  tagChipList: HTMLElement;
  tags: string[];
  onRemoveTag: (slug: string) => void;
}

export function normalizeTagSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(TAG_NON_ALNUM_PATTERN, "")
    .replace(TAG_MULTI_DASH_PATTERN, "-")
    .replace(/^-|-$/g, "");
}

export function dedupeTagSlugs(values: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeTagSlug(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    deduped.push(normalized);
  });
  return deduped;
}

export function consumeTagInputValue(
  rawValue: string,
  currentTags: string[],
): { nextTags: string[]; consumed: boolean } {
  const tokens = rawValue
    .split(TAG_SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return { nextTags: currentTags, consumed: false };
  }

  const nextTags = dedupeTagSlugs([...currentTags, ...tokens]);
  return {
    nextTags,
    consumed: nextTags.length !== currentTags.length,
  };
}

export function syncTagInputState(
  tagInput: HTMLInputElement,
  selectedTags: string[],
): void {
  tagInput.setAttribute("data-has-tags", selectedTags.length > 0 ? "true" : "false");
}

export function buildTagSuggestionOptions(
  suggestionList: HTMLDataListElement,
  options: AdminTagOption[],
): void {
  suggestionList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.slug;
    item.label = option.label;
    fragment.append(item);
  });
  suggestionList.append(fragment);
}

export function renderMetadataChipRail({
  rail,
  tagChipList,
  tags,
  onRemoveTag,
}: MetadataChipRailArgs): void {
  if (!rail.contains(tagChipList)) {
    rail.append(tagChipList);
  }

  tagChipList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  tags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "writer-meta-chip writer-meta-chip-tag";
    chip.dataset.tag = tag;
    chip.setAttribute("aria-label", `${tag} 태그 삭제`);
    chip.textContent = `#${tag}`;
    chip.addEventListener("click", () => {
      onRemoveTag(tag);
    });
    fragment.append(chip);
  });

  tagChipList.append(fragment);
  rail.hidden = tags.length === 0;
}
