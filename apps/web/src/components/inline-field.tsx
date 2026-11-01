import { useFormLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Pencil } from "lucide-react";
import { updateReference } from "#/server/library.functions";
import type { ReferenceEditErrors } from "#/server/library.server";

type InlineFieldProps = {
  slug: string;
  /** The field as `updateReference` knows it; its error shows below the control. */
  name: keyof ReferenceEditErrors;
  /** What the pencil says to screen readers, e.g. "Quelle bearbeiten". */
  editLabel: string;
  /** The value as shown, or null when there is none ("Nicht angegeben" then starts editing). */
  value: ReactNode;
  /** Placeholder text for an empty value. */
  emptyText?: string;
  /** The control while editing, with `name` set; it should take the focus. */
  control: (editor: { id: string; errorId?: string }) => ReactNode;
  /** Called after a successful save, e.g. to reload the reference. */
  onSaved: () => Promise<unknown>;
};

/**
 * One field of the detail view, editable in place: the value with a small
 * pencil that shows on hover (always on touch screens). The pencil, or a
 * click on an empty value, turns the row into a mini form with only this
 * field, so the rest of the reference stays as it is. Enter in a text field
 * or Ctrl/⌘+Enter saves, Escape cancels.
 */
export function InlineField({ slug, name, editLabel, value, emptyText = m.field_not_provided(), control, onSaved }: InlineFieldProps) {
  const languageForm = useFormLanguageGuard();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const id = `inline-${name}`;

  function close() {
    setEditing(false);
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const result = await updateReference({ data: new FormData(event.currentTarget) });
      if (result.ok) {
        await onSaved();
        close();
      } else setError(result.errors[name]?.[0] ?? m.action_failed());
    } catch {
      setError(m.action_failed());
    }
    setPending(false);
  }

  function handleKeys(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !pending) {
      event.preventDefault();
      close();
    }
    const modified = event.metaKey || event.ctrlKey;
    // Plain Enter saves single-line fields; in a note it starts a new line, and the tag input keeps it for its chips.
    const singleLine = event.target instanceof HTMLInputElement && event.target.role !== "combobox";
    if (event.key === "Enter" && (modified || singleLine)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  if (editing) {
    const errorId = error ? `${id}-error` : undefined;
    return (
      <form ref={languageForm.form} noValidate onSubmit={submit} onKeyDown={handleKeys} className="min-w-0">
      <fieldset disabled={pending} className="contents">
        <input type="hidden" name="slug" value={slug} />
        {control({ id, errorId })}
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {pending ? m.action_saving() : m.action_save()}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={close}
            className="rounded-md px-2.5 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-60"
          >
            {m.action_cancel()}</button>
        </div>
      </fieldset>
      </form>
    );
  }

  if (value === null) {
    return (
      <button
        type="button"
        onClick={() => (languageForm.reset(), setEditing(true))}
        aria-label={editLabel}
        className="group/inline -mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 text-left text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700"
      >
        {emptyText}
        <Pencil aria-hidden className="size-3.5 opacity-0 group-hover/inline:opacity-100 [@media(hover:none)]:opacity-100" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <div className="group/inline flex min-w-0 items-start gap-1.5">
      <div className="min-w-0">{value}</div>
      <button
        type="button"
        onClick={() => (languageForm.reset(), setEditing(true))}
        aria-label={editLabel}
        title={editLabel}
        className="-my-0.5 shrink-0 rounded-md p-1 text-neutral-400 opacity-0 group-hover/inline:opacity-100 hover:bg-neutral-200/60 hover:text-neutral-800 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Pencil aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
