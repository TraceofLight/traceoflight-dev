import type { EditorBridge } from "./types";

type CrepeRuntime = {
  Crepe: typeof import("@milkdown/crepe").Crepe;
  replaceAll: typeof import("@milkdown/utils").replaceAll;
};

let crepeRuntimePromise: Promise<CrepeRuntime> | null = null;

async function loadCrepeRuntime(): Promise<CrepeRuntime> {
  if (crepeRuntimePromise) {
    return crepeRuntimePromise;
  }

  crepeRuntimePromise = (async () => {
    const { Crepe } = await import("@milkdown/crepe");
    const { replaceAll } = await import("@milkdown/utils");
    return { Crepe, replaceAll };
  })();

  return crepeRuntimePromise;
}

export async function createEditorBridge(
  editorRoot: HTMLElement,
  initialValue: string,
): Promise<EditorBridge> {
  try {
    const { Crepe, replaceAll } = await loadCrepeRuntime();
    const editor = new Crepe({
      root: editorRoot,
      defaultValue: initialValue,
    });
    await editor.create();

    return {
      mode: "crepe",
      getMarkdown: async () => {
        const markdown = editor.getMarkdown();
        if (typeof markdown === "string") return markdown;
        return markdown;
      },
      setMarkdown: async (markdown: string) => {
        editor.editor.action(replaceAll(markdown));
      },
      observeChanges: (onChange: () => void) => {
        const observer = new MutationObserver(() => onChange());
        observer.observe(editorRoot, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        editorRoot.addEventListener("input", onChange);
        editorRoot.addEventListener("keyup", onChange);
        return () => {
          observer.disconnect();
          editorRoot.removeEventListener("input", onChange);
          editorRoot.removeEventListener("keyup", onChange);
        };
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown init error";
    console.error("[writer] crepe init failed:", error);

    const textarea = document.createElement("textarea");
    textarea.id = "writer-fallback-textarea";
    textarea.className = "writer-fallback-textarea";
    textarea.value = initialValue;
    textarea.placeholder = "Write your story here...";
    editorRoot.replaceChildren(textarea);

    return {
      mode: "fallback",
      initError: message,
      getMarkdown: async () => textarea.value,
      setMarkdown: async (markdown: string) => {
        textarea.value = markdown;
      },
      observeChanges: (onChange: () => void) => {
        textarea.addEventListener("input", onChange);
        return () => textarea.removeEventListener("input", onChange);
      },
    };
  }
}
