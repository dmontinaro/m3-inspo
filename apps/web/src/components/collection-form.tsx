import { useId, useState } from "react";
import type { FormEvent } from "react";
import { maxCollectionDescriptionLength, maxCollectionNameLength } from "#/lib/collections";
import { fieldClassName } from "#/lib/form-styles";
import { maxTagLength } from "#/lib/tags";
import { addCollection, updateCollection } from "#/server/collections.functions";
import type { CollectionErrors } from "#/server/collections.server";

type EditedCollection = { slug: string; name: string; description: string | null; project: string | null };

/**
 * Name, description and optional project of a collection. Creates a new one,
 * or saves `collection` when given. `tags` are the owner's tags in use,
 * offered as projects. Calls `onSaved` with the slug once the server accepted.
 */
export function CollectionForm({
  collection,
  tags,
  onSaved,
  onCancel,
}: {
  collection?: EditedCollection;
  tags: string[];
  onSaved: (slug: string) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<CollectionErrors>({});
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFailed(false);
    try {
      if (collection) {
        form.set("slug", collection.slug);
        const result = await updateCollection({ data: form });
        if (!result.ok) return setErrors(result.errors);
        await onSaved(collection.slug);
      } else {
        const result = await addCollection({ data: form });
        if (!result.ok) return setErrors(result.errors);
        await onSaved(result.slug);
      }
      setErrors({});
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  const fieldError = (messages: string[] | undefined) =>
    messages?.[0] && <p className="mt-1.5 text-sm text-rose-700">{messages[0]}</p>;

  return (
    <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <label htmlFor={`${id}-name`} className="text-sm font-medium text-neutral-900">
            Name
          </label>
          <input
            id={`${id}-name`}
            name="name"
            required
            autoFocus
            maxLength={maxCollectionNameLength}
            defaultValue={collection?.name}
            placeholder="z. B. Ruhige Hotels"
            className={fieldClassName}
          />
          {fieldError(errors.name)}
        </div>
        <div>
          <label htmlFor={`${id}-project`} className="text-sm font-medium text-neutral-900">
            Projekt <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <input
            id={`${id}-project`}
            name="project"
            list={`${id}-tags`}
            maxLength={maxTagLength}
            defaultValue={collection?.project ?? ""}
            placeholder="z. B. sample-project"
            className={fieldClassName}
          />
          <datalist id={`${id}-tags`}>
            {tags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          {fieldError(errors.project)}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-description`} className="text-sm font-medium text-neutral-900">
            Beschreibung <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            id={`${id}-description`}
            name="description"
            rows={2}
            maxLength={maxCollectionDescriptionLength}
            defaultValue={collection?.description ?? ""}
            placeholder="Was die Referenzen verbindet. Agenten lesen das mit."
            className={fieldClassName}
          />
          {fieldError(errors.description)}
        </div>
      </div>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Das hat nicht geklappt. Bitte versuche es noch einmal.
        </p>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3.5 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {collection ? "Speichern" : "Sammlung anlegen"}
        </button>
      </div>
    </form>
  );
}
