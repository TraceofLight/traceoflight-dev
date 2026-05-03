import { useRef, useState } from "react";
import { FileTextIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getStatusClass,
  type StatusMessage,
} from "@/lib/admin/imports-panel-feedback";
import { resolveErrorMessage } from "@/lib/http";
import {
  PUBLIC_FIELD_DISPLAY_CLASS,
  PUBLIC_PANEL_SURFACE_CLASS,
  PUBLIC_SURFACE_ACTION_CLASS,
} from "@/lib/ui-effects";

const adminActionButtonClass =
  `${PUBLIC_SURFACE_ACTION_CLASS} min-h-11 justify-center self-start hover:border-sky-300/90 hover:text-sky-700 hover:shadow-[0_18px_40px_rgba(49,130,246,0.14)]`;

export interface PdfUploadCardLabels {
  badge: string;
  title: string;
  selectButton: string;
  selectedEmpty: string;
  uploadButton: string;
  deleteButton: string;
  fileInputAriaLabel: string;
  fileInputId: string;
  uploadButtonId: string;
  deleteButtonId: string;
  containerId?: string;
}

export interface PdfUploadCardMessages {
  initialAvailable: string;
  initialUnavailable: string;
  selectFileRequired: string;
  uploading: string;
  uploadSuccess: string;
  uploadFailureFallback: string;
  uploadNetworkError: string;
  deleting: string;
  deleteSuccess: string;
  deleteFailureFallback: string;
  deleteNetworkError: string;
}

interface PdfUploadCardProps {
  initialAvailable: boolean;
  labels: PdfUploadCardLabels;
  messages: PdfUploadCardMessages;
  uploadFn: (file: File) => Promise<{ response: Response; payload: unknown }>;
  deleteFn: () => Promise<{ response: Response; payload: unknown }>;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}

export default function PdfUploadCard({
  initialAvailable,
  labels,
  messages,
  uploadFn,
  deleteFn,
  busy,
  onBusyChange,
}: PdfUploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [available, setAvailable] = useState(initialAvailable);
  const [status, setStatus] = useState<StatusMessage>({
    message: initialAvailable ? messages.initialAvailable : messages.initialUnavailable,
    state: "info",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function clearSelection() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setStatus({ message: messages.selectFileRequired, state: "error" });
      return;
    }

    onBusyChange(true);
    setStatus({ message: messages.uploading, state: "pending" });

    try {
      const { response, payload } = await uploadFn(selectedFile);
      if (!response.ok) {
        setStatus({
          message: resolveErrorMessage(payload, messages.uploadFailureFallback),
          state: "error",
        });
        return;
      }

      clearSelection();
      setAvailable(true);
      setStatus({ message: messages.uploadSuccess, state: "ok" });
    } catch {
      setStatus({ message: messages.uploadNetworkError, state: "error" });
    } finally {
      onBusyChange(false);
    }
  }

  async function handleDelete() {
    onBusyChange(true);
    setStatus({ message: messages.deleting, state: "pending" });

    try {
      const { response, payload } = await deleteFn();
      if (!response.ok) {
        setStatus({
          message: resolveErrorMessage(payload, messages.deleteFailureFallback),
          state: "error",
        });
        return;
      }

      setAvailable(false);
      clearSelection();
      setStatus({ message: messages.deleteSuccess, state: "ok" });
    } catch {
      setStatus({ message: messages.deleteNetworkError, state: "error" });
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <section
      className={`grid gap-4 p-5 ${PUBLIC_PANEL_SURFACE_CLASS}`}
      id={labels.containerId}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
            {labels.badge}
          </p>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">
            {labels.title}
          </h3>
        </div>
        {available ? (
          <Button
            className="border-red-200/80 bg-white/88 px-4 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            disabled={busy}
            id={labels.deleteButtonId}
            onClick={handleDelete}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2Icon className="h-4 w-4" />
            {labels.deleteButton}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2">
        <input
          accept=".pdf,application/pdf"
          aria-label={labels.fileInputAriaLabel}
          className="sr-only"
          disabled={busy}
          id={labels.fileInputId}
          ref={fileInputRef}
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          type="file"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            className={`${adminActionButtonClass} sm:min-w-36`}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            type="button"
            variant="outline"
          >
            {labels.selectButton}
          </Button>
          <div className={`min-w-0 flex-1 ${PUBLIC_FIELD_DISPLAY_CLASS}`}>
            <span className="block truncate">
              {selectedFile ? selectedFile.name : labels.selectedEmpty}
            </span>
          </div>
        </div>
      </div>
      <Button
        className={`${adminActionButtonClass} px-6`}
        disabled={busy}
        id={labels.uploadButtonId}
        onClick={handleUpload}
        type="button"
        variant="outline"
      >
        <FileTextIcon className="h-4 w-4" />
        {labels.uploadButton}
      </Button>
      <div className={getStatusClass(status.state)}>{status.message}</div>
    </section>
  );
}
