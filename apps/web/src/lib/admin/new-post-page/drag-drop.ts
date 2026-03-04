import type { DropTarget } from "./types";

export function resolveDropTarget(event: DragEvent): DropTarget {
  const eventTarget = event.target;
  const element =
    eventTarget instanceof Element
      ? eventTarget
      : eventTarget instanceof Node
        ? eventTarget.parentElement
        : null;
  if (!element) return null;
  if (element.closest("#writer-cover-drop-zone")) return "cover";
  if (element.closest("#writer-cover-preview")) return "cover";
  if (
    element.closest("#writer-editor-drop-zone") ||
    element.closest("#milkdown-editor")
  ) {
    return "body";
  }
  return null;
}

export function isMediaFileDrag(event: DragEvent): boolean {
  const items = event.dataTransfer?.items;
  if (items && items.length > 0) {
    return Array.from(items).some((item) => {
      if (item.kind !== "file") return false;
      const mime = item.type.toLowerCase();
      if (!mime) return true;
      return mime.startsWith("image/") || mime.startsWith("video/");
    });
  }

  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}
