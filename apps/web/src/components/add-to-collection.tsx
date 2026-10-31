import { useFormLanguageGuard, useLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useState } from "react";
import type { FormEvent } from "react";
import { Check, FolderPlus, Plus } from "lucide-react";
import { maxCollectionNameLength } from "#/lib/collections";
import {
  addCollection,
  addReferenceToCollection,
  removeReferenceFromCollection,
} from "#/server/collections.functions";
import { useDismiss } from "./use-dismiss";

type CollectionOption = { slug: string; name: string };

/**
 * "Zu Sammlung hinzufügen" on a reference's detail view: a menu with every
 * collection, checked where the reference already is. A click adds it at the
 * end of that collection or takes it out again; the menu stays open for more.
 * "Neue Sammlung" creates one by name and adds the reference right away.
 * `onChanged` reloads the page data after each change.
 */
export function AddToCollection({
  referenceSlug,
  memberOf,
  collections,
  onChanged,
}: {
  referenceSlug: string;
  memberOf: CollectionOption[];
  collections: CollectionOption[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const container = useDismiss(open, setOpen);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const languageForm = useFormLanguageGuard();
  useLanguageGuard({ blocker: pending ? m.language_block_mutation() : undefined });
  const members = new Set(memberOf.map((collection) => collection.slug));

  async function run(action: () => Promise<string | undefined>) {
    setPending(true);
    setError(null);
    try {
      const problem = await action();
      if (problem) return setError(problem);
      await onChanged();
    } catch {
      setError(m.action_failed());
    } finally {
      setPending(false);
    }
  }

  function toggle(collection: string) {
    const data = { collection, reference: referenceSlug };
    return run(async () => {
      if (members.has(collection)) await removeReferenceFromCollection({ data });
      else await addReferenceToCollection({ data });
      return undefined;
    });
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return run(async () => {
      const created = await addCollection({ data: form });
      if (!created.ok) return created.errors.name?.[0] ?? created.errors.project?.[0] ?? m.validation_invalid_input();
      await addReferenceToCollection({ data: { collection: created.slug, reference: referenceSlug } });
      setCreating(false);
      return undefined;
    });
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm text-neutral-600 ring-1 ring-neutral-300 ring-inset hover:bg-neutral-100 hover:text-neutral-900"
      >
        <FolderPlus aria-hidden className="size-3.5" strokeWidth={1.75} />
        {m.collection_add_reference()}</button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg shadow-black/10">
          <p className="px-2.5 pt-1.5 pb-2 text-xs font-medium tracking-wide text-neutral-400 uppercase">{m.collections_title()}</p>
          {collections.length === 0 ? (
            <p className="px-2.5 pb-2 text-sm text-neutral-500">{m.collections_none()}</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {collections.map((collection) => (
                <li key={collection.slug}>
                  <button
                    type="button"
                    disabled={pending}
                    aria-pressed={members.has(collection.slug)}
                    onClick={() => toggle(collection.slug)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-60 aria-pressed:font-medium aria-pressed:text-neutral-950"
                  >
                    <span className="truncate">{collection.name}</span>
                    {members.has(collection.slug) && <Check aria-hidden className="size-4 shrink-0 text-neutral-900" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mx-2.5 my-1.5 border-t border-neutral-100" />
          {creating ? (
            <form ref={languageForm.form} noValidate onSubmit={create} className="flex gap-1.5 p-1">
              <label className="sr-only" htmlFor="new-collection-name">
                {m.collection_new_name()}</label>
              <input
                id="new-collection-name"
                name="name"
                required
                autoFocus
                maxLength={maxCollectionNameLength}
                placeholder={m.field_name()}
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending}
                className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
              >
                {m.action_create()}</button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
            >
              <Plus aria-hidden className="size-4 text-neutral-400" strokeWidth={2} />
              {m.collection_new()}</button>
          )}
          {error && (
            <p role="alert" className="mx-1 mt-1 rounded-md bg-rose-50 px-2.5 py-1.5 text-sm text-rose-800">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
