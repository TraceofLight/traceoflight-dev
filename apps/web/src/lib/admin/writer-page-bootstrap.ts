import { initNewPostAdminPage } from "./new-post-page";

function readInitialPayload() {
  const payloadScript = document.querySelector("#writer-initial-payload");
  if (!(payloadScript instanceof HTMLScriptElement)) return null;
  if (!payloadScript.textContent) return null;
  try {
    return JSON.parse(payloadScript.textContent);
  } catch {
    return null;
  }
}

export async function bootAdminWriterPage(): Promise<void> {
  const form = document.querySelector("#admin-post-form");
  if (!(form instanceof HTMLFormElement)) return;

  const initialized = form.dataset.writerInitialized === "true";
  const booting = form.dataset.writerBooting === "true";
  if (initialized === true || booting === true) return;

  form.dataset.writerBooting = "true";

  const mode = form.dataset.writerMode === "edit" ? "edit" : "create";
  const contentKind =
    form.dataset.initialContentKind === "project" ? "project" : "blog";
  const slug = form.dataset.editSlug ?? "";
  const initialPayload = readInitialPayload();

  try {
    const initialized = await initNewPostAdminPage({
      mode,
      slug,
      contentKind,
      initialPayload,
    });
    if (initialized === true) {
      form.dataset.writerInitialized = "true";
      return;
    }
    delete form.dataset.writerInitialized;
  } catch (error) {
    delete form.dataset.writerInitialized;
    throw error;
  } finally {
    delete form.dataset.writerBooting;
  }
}
