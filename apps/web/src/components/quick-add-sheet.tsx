import { useFormLanguageGuard, LanguageControl  } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { maxSourceUrlLength } from "#/lib/curation";
import { fieldClassName } from "#/lib/form-styles";
import { maxNoteLength, maxTitleLength } from "#/lib/upload-limits";
import { TagInput } from "./tag-input";

type QuickAddSheetProps = {
  file: File;
  /** The draft's title, prefilled and owned by the caller. */
  title: string;
  onTitleChange: (title: string) => void;
  /** Sends the form's fields (title, notes, tags, source); resolves to a reason when the upload was rejected. */
  onSave: (form: FormData) => Promise<string | undefined>;
  onCancel: () => void;
};

/**
 * Modal sheet for one pasted, dropped or picked image: preview, a prefilled
 * title, the two note fields, tags and source, with the cursor already in
 * "Übernehmen". Centered on
 * wide screens, a bottom sheet on phones. Escape cancels, Ctrl/⌘+Enter saves.
 */
export function QuickAddSheet({ file, title, onTitleChange, onSave, onCancel }: QuickAddSheetProps) {
  const languageForm = useFormLanguageGuard();
  const dialog = useRef<HTMLDialogElement>(null);
  const takeNote = useRef<HTMLTextAreaElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    // Only now is the field visible and focusable.
    takeNote.current?.focus();
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const reason = await onSave(new FormData(event.currentTarget));
    // On success the sheet is gone; only a rejection gets back here.
    if (reason) {
      setError(reason);
      setPending(false);
    }
  }

  function saveOnModEnter(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="quick-add-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-4rem)] w-[min(60rem,calc(100%-4rem))] max-w-none overflow-y-auto rounded-xl bg-white text-neutral-900 shadow-2xl ring-1 ring-black/10 backdrop:bg-neutral-950/25 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:rounded-b-none"
    >
      <form ref={languageForm.form} noValidate onSubmit={submit} onKeyDown={saveOnModEnter} className="grid md:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Phones: a strip from the top of the image. Wider: the whole image, framed and centered. */}
        <div className="max-h-44 overflow-hidden bg-neutral-100 md:flex md:max-h-[calc(100dvh-4rem)] md:items-center md:overflow-y-auto md:p-6">
          {previewUrl && <img src={previewUrl} alt="" className="w-full md:rounded-md md:shadow-sm md:ring-1 md:ring-black/5" />}
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-6">
        <LanguageControl />
          <h2 id="quick-add-heading" className="text-base font-semibold tracking-tight">
            {m.reference_new()}</h2>

          <div>
            <label htmlFor="quick-add-title" className="text-sm font-medium">
              {m.field_title()}</label>
            <input
              id="quick-add-title"
              name="title"
              required
              maxLength={maxTitleLength}
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              className={fieldClassName}
            />
          </div>

          <div>
            <label htmlFor="quick-add-take" className="text-sm font-medium">
              {m.reference_take()}</label>
            <textarea
              ref={takeNote}
              id="quick-add-take"
              name="takeNote"
              rows={3}
              maxLength={maxNoteLength}
              placeholder={m.reference_take_placeholder()}
              className={fieldClassName}
            />
          </div>

          <div>
            <label htmlFor="quick-add-avoid" className="text-sm font-medium">
              {m.reference_avoid()}</label>
            <textarea
              id="quick-add-avoid"
              name="avoidNote"
              rows={3}
              maxLength={maxNoteLength}
              placeholder={m.reference_avoid_placeholder()}
              className={fieldClassName}
            />
          </div>

          <div>
            <label htmlFor="quick-add-tags" className="text-sm font-medium">
              {m.field_tags()}</label>
            <TagInput id="quick-add-tags" />
          </div>

          <div>
            <label htmlFor="quick-add-source" className="text-sm font-medium">
              {m.field_source()}</label>
            <input
              id="quick-add-source"
              name="sourceUrl"
              // Not type="url": the browser would turn away "stripe.com", which the server completes to https://.
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={maxSourceUrlLength}
              placeholder="https://"
              className={fieldClassName}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}

          <div className="mt-auto flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
            >
              {pending ? m.action_saving() : m.action_save()}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="rounded-md px-3 py-2.5 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-60"
            >
              {m.action_discard()}</button>
            <span className="ml-auto text-xs text-neutral-400 max-sm:hidden">{m.shortcut_save()}</span>
          </div>
        </div>
      </form>
    </dialog>
  );
}
