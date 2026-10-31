import { useFormLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import type { ReferenceDevice } from "@m3-inspo/db/library-schema";
import { deviceLabels, devices, focusAreas, focusLabels, maxAttributionLength, maxSourceUrlLength } from "#/lib/curation";
import { fieldClassName } from "#/lib/form-styles";
import { maxNoteLength, maxTitleLength } from "#/lib/upload-limits";
import { updateReference } from "#/server/library.functions";
import type { ReferenceEditErrors } from "#/server/library.server";
import { TagInput } from "./tag-input";

type EditableReference = {
  slug: string;
  title: string;
  sourceUrl: string | null;
  attribution: string | null;
  takeNote: string | null;
  avoidNote: string | null;
  focus: string | null;
  device: ReferenceDevice;
  tags: string[];
};

type ReferenceEditFormProps = {
  reference: EditableReference;
  /** Called after a successful save, once the new values are stored. */
  onSaved: () => Promise<void>;
  onCancel: () => void;
};

const noteClassName = `${fieldClassName} field-sizing-content min-h-24 leading-relaxed`;

/**
 * The detail view's sidebar in edit mode: every curation field of one
 * reference in a single form. The server checks the input and answers German
 * messages per field, shown under the field. Escape cancels, Ctrl/⌘+Enter saves.
 */
export function ReferenceEditForm({ reference, onSaved, onCancel }: ReferenceEditFormProps) {
  const languageForm = useFormLanguageGuard();
  const title = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<ReferenceEditErrors>({});
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => title.current?.focus(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    try {
      const result = await updateReference({ data: new FormData(event.currentTarget) });
      if (result.ok) {
        await onSaved();
        return;
      }
      setErrors(result.errors);
    } catch {
      setFailed(true);
    }
    setPending(false);
  }

  function handleKeys(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !pending) onCancel();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  return (
    <form ref={languageForm.form} noValidate onSubmit={submit} onKeyDown={handleKeys} className="space-y-5">
      <fieldset disabled={pending} className="contents">
      <input type="hidden" name="slug" value={reference.slug} />

      <Field id="edit-title" label={m.field_title()} error={errors.title}>
        <input
          ref={title}
          id="edit-title"
          name="title"
          required
          maxLength={maxTitleLength}
          defaultValue={reference.title}
          className={fieldClassName}
          {...describedBy("edit-title", errors.title)}
        />
      </Field>

      <Field id="edit-focus" label={m.reference_focus()} error={errors.focus}>
        <select
          id="edit-focus"
          name="focus"
          defaultValue={reference.focus ?? ""}
          className={fieldClassName}
          {...describedBy("edit-focus", errors.focus)}
        >
          <option value="">{m.field_not_set()}</option>
          {focusAreas.map((area) => (
            <option key={area} value={area}>
              {focusLabels[area]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="edit-device" label={m.field_format()} error={errors.device}>
        <select
          id="edit-device"
          name="device"
          defaultValue={reference.device}
          className={fieldClassName}
          {...describedBy("edit-device", errors.device)}
        >
          {devices.map((device) => (
            <option key={device} value={device}>
              {deviceLabels[device]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="edit-take" label={m.reference_take()} error={errors.takeNote} dotClassName="bg-emerald-500">
        <textarea
          id="edit-take"
          name="takeNote"
          maxLength={maxNoteLength}
          defaultValue={reference.takeNote ?? ""}
          placeholder={m.reference_take_placeholder()}
          className={noteClassName}
          {...describedBy("edit-take", errors.takeNote)}
        />
      </Field>

      <Field id="edit-avoid" label={m.reference_avoid()} error={errors.avoidNote} dotClassName="bg-rose-500">
        <textarea
          id="edit-avoid"
          name="avoidNote"
          maxLength={maxNoteLength}
          defaultValue={reference.avoidNote ?? ""}
          placeholder={m.reference_avoid_placeholder()}
          className={noteClassName}
          {...describedBy("edit-avoid", errors.avoidNote)}
        />
      </Field>

      <Field id="edit-tags" label={m.field_tags()} error={errors.tags}>
        <TagInput id="edit-tags" defaultTags={reference.tags} errorId={errors.tags ? "edit-tags-error" : undefined} />
      </Field>

      <Field id="edit-source" label={m.field_source()} error={errors.sourceUrl}>
        <input
          id="edit-source"
          name="sourceUrl"
          type="url"
          inputMode="url"
          maxLength={maxSourceUrlLength}
          defaultValue={reference.sourceUrl ?? ""}
          placeholder="https://"
          className={fieldClassName}
          {...describedBy("edit-source", errors.sourceUrl)}
        />
      </Field>

      <Field id="edit-attribution" label={m.reference_attribution_label()} error={errors.attribution}>
        <input
          id="edit-attribution"
          name="attribution"
          maxLength={maxAttributionLength}
          defaultValue={reference.attribution ?? ""}
          placeholder={m.attribution_placeholder()}
          className={fieldClassName}
          {...describedBy("edit-attribution", errors.attribution)}
        />
      </Field>

      {failed && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {m.reference_save_failed()}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
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
          {m.action_cancel()}</button>
        <span className="ml-auto text-xs text-neutral-400 max-sm:hidden">{m.shortcut_save()}</span>
      </div>
    </fieldset>
      </form>
  );
}

/** Links a control to its error message below, for screen readers. */
function describedBy(id: string, error: string[] | undefined) {
  return error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};
}

function Field({
  id,
  label,
  error,
  dotClassName,
  children,
}: {
  /** The control's id. */
  id: string;
  label: string;
  error?: string[];
  /** Colored dot before the label, as for the notes in the read view. */
  dotClassName?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-neutral-900">
        {dotClassName && <span aria-hidden className={`size-2 rounded-full ${dotClassName}`} />}
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-700">
          {error[0]}
        </p>
      )}
    </div>
  );
}
