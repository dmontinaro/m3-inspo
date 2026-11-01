import { formatNumber } from "#/lib/format";
import { beginLanguageOperation } from "#/lib/language-operations";
import { useLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useRouter } from "@tanstack/react-router";
import { createContext, use, useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactNode } from "react";
import { maxUploadMegabytes } from "#/lib/upload-limits";
import { precheckFile, screenshotTitle, titleFromFileName } from "#/lib/upload-files";
import { uploadImage } from "#/server/library.functions";
import { QuickAddSheet } from "./quick-add-sheet";
import { UploadTray } from "./upload-tray";
import type { TrayItem } from "./upload-tray";

type Draft = { id: string; file: File; title: string };

const QuickAddContext = createContext<((files: File[]) => void) | null>(null);

/**
 * Hands picked files to the quick add, e.g. from a file input:
 * `const addFiles = useQuickAdd(); addFiles([...input.files])`.
 */
export function useQuickAdd() {
  const addFiles = use(QuickAddContext);
  if (!addFiles) throw new Error("useQuickAdd needs a <QuickAdd> around it.");
  return addFiles;
}

/**
 * Adds images from anywhere inside it: paste a screenshot (outside text
 * fields) or drop files onto the window. One image opens a sheet with its
 * preview, the note fields, tags and source; several are uploaded one after
 * another with only a title. Everything goes through `uploadImage`, the same server
 * function and checks as the upload page. Progress and rejections show in
 * a small tray.
 */
export function QuickAdd({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [trayItems, setTrayItems] = useState<TrayItem[]>([]);
  const [dragging, setDragging] = useState(false);
  // Dragging something from the page itself (e.g. a gallery image) is no upload.
  const draggingFromPage = useRef(false);
  useLanguageGuard({ dirty: draft !== null || trayItems.some((item) => item.status === "failed") });

  function updateItem(id: string, item: TrayItem) {
    setTrayItems((items) => items.map((current) => (current.id === id ? item : current)));
  }

  /**
   * Uploads with only a title, one tray line each. With a `title` (pasted images,
   * which have no useful names) they are numbered "<title> (1)", "<title> (2)" …
   */
  async function uploadAll(files: File[], title?: string) {
    const queued = files.map((file, index) => ({
      id: crypto.randomUUID(),
      file,
      title: title ? `${title} (${index + 1})` : titleFromFileName(file.name),
      reason: precheckFile(file),
    }));
    setTrayItems((items) => [
      ...items,
      ...queued.map(({ id, title: label, reason, file }): TrayItem =>
        reason ? { id, label, status: "failed", reason, file } : { id, label, status: "uploading" },
      ),
    ]);
    const finishUpload = beginLanguageOperation("upload");
    try {
    // One after another, so the server decodes one large image at a time.
    for (const { id, file, title: label, reason } of queued) {
      if (reason) continue;
      const data = new FormData();
      data.set("file", file);
      data.set("title", label);
      const result = await send(data);
      updateItem(id, result.ok ? { id, label, status: "saved", slug: result.slug } : { id, label, status: "failed", reason: result.reason, file });
      if (result.ok) void router.invalidate();
    }
    } finally { finishUpload(); }
  }

  /**
   * One image opens the note sheet; several go straight to the tray. While a
   * sheet is open, new images also go to the tray, so none gets lost.
   * `title` replaces the file name as title (pasted images).
   */
  function add(files: File[], title?: string) {
    if (files.length > 1 || draft) return void uploadAll(files, title);
    const file = files.at(0);
    if (!file) return;

    const draftTitle = title ?? titleFromFileName(file.name);
    const reason = precheckFile(file);
    if (reason) return setTrayItems((items) => [...items, { id: crypto.randomUUID(), label: draftTitle, status: "failed", reason, file }]);
    setDraft({ id: crypto.randomUUID(), file, title: draftTitle });
  }

  async function saveDraft(form: FormData) {
    if (!draft) return;
    form.set("file", draft.file);
    const result = await send(form);
    if (!result.ok) return result.reason;

    setDraft(null);
    setTrayItems((items) => [...items, { id: draft.id, label: draft.title.trim(), status: "saved", slug: result.slug }]);
    void router.invalidate();
  }

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0 || isEditable(event.target)) return;
    event.preventDefault();
    add(files, screenshotTitle(new Date()));
  });

  const onDragEnter = useEffectEvent((event: DragEvent) => {
    if (hasFiles(event) && !draggingFromPage.current && !draft) setDragging(true);
  });

  const onDrop = useEffectEvent((event: DragEvent) => {
    if (!hasFiles(event) || draggingFromPage.current) return;
    // Without this the browser would open the dropped file in place of the app.
    event.preventDefault();
    setDragging(false);
    add([...(event.dataTransfer?.files ?? [])]);
  });

  useEffect(() => {
    const listeners = new AbortController();
    const { signal } = listeners;
    window.addEventListener("paste", onPaste, { signal });
    window.addEventListener("dragstart", () => (draggingFromPage.current = true), { signal });
    window.addEventListener("dragend", () => (draggingFromPage.current = false), { signal });
    window.addEventListener("dragenter", onDragEnter, { signal });
    window.addEventListener(
      "dragover",
      (event) => {
        if (hasFiles(event) && !draggingFromPage.current) event.preventDefault();
      },
      { signal },
    );
    window.addEventListener("drop", onDrop, { signal });
    return () => listeners.abort();
  }, []);

  // Once everything in the tray went through, it tidies itself away. Rejections stay until closed.
  useEffect(() => {
    if (trayItems.length === 0 || trayItems.some((item) => item.status !== "saved")) return;
    const timer = setTimeout(() => setTrayItems([]), 5000);
    return () => clearTimeout(timer);
  }, [trayItems]);

  return (
    <QuickAddContext value={add}>
      {children}

      {dragging && (
        // Covers the whole window while files are dragged over it; its children
        // ignore the pointer, so dragleave only fires when leaving the window.
        <div
          onDragLeave={() => setDragging(false)}
          className="fixed inset-0 z-50 flex bg-stone-50/80 p-4 backdrop-blur-sm sm:p-8"
        >
          <div className="pointer-events-none flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-400 text-center">
            <p className="text-lg font-medium text-neutral-900">{m.upload_drop()}</p>
            <p className="mt-1 text-sm text-neutral-500">{m.upload_drop_help({ max: formatNumber(maxUploadMegabytes) })}</p>
          </div>
        </div>
      )}

      {draft && (
        <QuickAddSheet
          key={draft.id}
          file={draft.file}
          title={draft.title}
          onTitleChange={(title) => setDraft({ ...draft, title })}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
        />
      )}

      <UploadTray items={trayItems} onClose={() => setTrayItems([])} />
    </QuickAddContext>
  );
}

/** `uploadImage`, with a network failure turned into a reason like any rejection. */
async function send(data: FormData): Promise<Awaited<ReturnType<typeof uploadImage>>> {
  try {
    return await uploadImage({ data });
  } catch {
    return { ok: false, reason: m.upload_failed() };
  }
}

function hasFiles(event: DragEvent) {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/** Paste into a text field stays a normal text paste. */
function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}
