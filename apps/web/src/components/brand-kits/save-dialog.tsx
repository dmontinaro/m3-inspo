import { useFormLanguageGuard, LanguageControl  } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { maxBrandKitNameLength } from "#/lib/brand-kits";
import { fieldClassName } from "#/lib/form-styles";
import type { Draft } from "#/lib/generator";
import { maxTagLength } from "#/lib/tags";
import { saveBrandKit } from "#/server/brand-kits.functions";
import type { BrandKitErrors } from "#/server/brand-kits.server";

type Props = {
  draft: Draft;
  /** Prefills the project, e.g. when the pool is `project:harbor`. */
  project: string;
  /** The owner's projects, offered in the project field. */
  projects: string[];
  /** Called with the new kit's slug once the server saved it. */
  onSaved: (slug: string) => Promise<void>;
  onCancel: () => void;
};

/**
 * The generator's "Speichern": name and optional project for a new Brand
 * Kit, saved as a draft with the Color Scheme as it stands. Notes follow
 * on the kit's page. Centered on wide screens, a bottom sheet on phones;
 * Escape cancels. The caller puts the focus back on its button.
 */
export function SaveDialog({ draft, project, projects, onSaved, onCancel }: Props) {
  const languageForm = useFormLanguageGuard();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<BrandKitErrors>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => dialog.current?.showModal(), []);

  /** Closes the modal first: until then the page behind it is inert and cannot take the focus back. */
  function cancel() {
    dialog.current?.close();
    onCancel();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFailed(false);
    try {
      const result = await saveBrandKit({
        data: {
          name: String(form.get("name") ?? ""),
          project: String(form.get("project") ?? ""),
          scheme: { sources: draft.sources, primary: draft.primary },
        },
      });
      if (!result.ok) {
        setErrors(result.errors);
        setPending(false);
        return;
      }
      // The page goes away; the button stays busy until it does.
      await onSaved(result.slug);
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  /** The field's error, linked to it by id so screen readers read it with the field. */
  const fieldError = (field: keyof BrandKitErrors) => {
    const message = errors[field]?.[0];
    return {
      props: message ? { "aria-invalid": true, "aria-describedby": `save-kit-${field}-error` } : {},
      text: message && (
        <p id={`save-kit-${field}-error`} className="mt-1.5 text-sm text-rose-700">
          {message}
        </p>
      ),
    };
  };
  const nameError = fieldError("name");
  const projectError = fieldError("project");

  return (
    <dialog
      ref={dialog}
      aria-labelledby="save-kit-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) cancel();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] max-w-none rounded-xl bg-white text-neutral-900 shadow-2xl ring-1 ring-black/10 backdrop:bg-neutral-950/25 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none"
    >
      <form ref={languageForm.form} noValidate onSubmit={submit} className="flex flex-col gap-5 p-5 sm:p-6">
        <LanguageControl />
        <div className="flex items-center gap-3">
          <SwatchStack draft={draft} />
          <div>
            <h2 id="save-kit-heading" className="text-base font-semibold tracking-tight">
              {m.kit_save_as()}</h2>
            <p className="text-sm text-neutral-500">{m.kit_save_help()}</p>
          </div>
        </div>

        <div>
          <label htmlFor="save-kit-name" className="text-sm font-medium">
            {m.field_name()}</label>
          <input
            id="save-kit-name"
            name="name"
            required
            autoFocus
            maxLength={maxBrandKitNameLength}
            placeholder={m.kit_name_placeholder()}
            className={fieldClassName}
            {...nameError.props}
          />
          {nameError.text}
        </div>

        <div>
          <label htmlFor="save-kit-project" className="text-sm font-medium">
            {m.field_project()}<span className="ml-1 font-normal text-neutral-400">{m.field_optional()}</span>
          </label>
          <input
            id="save-kit-project"
            name="project"
            list="save-kit-projects"
            maxLength={maxTagLength}
            defaultValue={project}
            placeholder={m.project_placeholder()}
            className={fieldClassName}
            {...projectError.props}
          />
          <datalist id="save-kit-projects">
            {projects.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          {projectError.text}
        </div>

        {failed && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {m.action_failed()}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-md px-3.5 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            {m.action_cancel()}</button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {pending ? m.action_saving() : m.kit_create()}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** The source colours as overlapping dots: what is about to be saved, at a glance. */
function SwatchStack({ draft }: { draft: Draft }) {
  const { brand, neutral, extras } = draft.sources;
  return (
    <div aria-hidden className="flex shrink-0 -space-x-2">
      {[brand, neutral, ...extras].map((color, index) => (
        <span key={index} className="size-8 rounded-full ring-2 ring-white" style={{ background: color.hex }} />
      ))}
    </div>
  );
}
