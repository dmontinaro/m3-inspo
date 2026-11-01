import * as m from "#/paraglide/messages.js";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ArrowUp, ListFilter, Palette, X } from "lucide-react";
import { poolValue } from "@m3-inspo/shared/color-scheme";
import { CollectionForm } from "#/components/collection-form";
import { FavoriteStar } from "#/components/favorite-star";
import { statusLabels } from "#/lib/curation";
import {
  deleteCollection,
  getCollection,
  removeReferenceFromCollection,
  setCollectionOrder,
} from "#/server/collections.functions";
import { listTags } from "#/server/library.functions";

export const Route = createFileRoute("/_library/collections/$slug")({
  loader: async ({ params }) => {
    const [collection, tags] = await Promise.all([getCollection({ data: { slug: params.slug } }), listTags()]);
    return { collection, tags };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.collection.name} · m3 inspo` : "m3 inspo" }] }),
  component: CollectionDetail,
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-xl font-semibold">{m.collection_not_found()}</h1>
      <Link to="/collections" className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4">
        {m.collections_back()}</Link>
    </main>
  ),
});

type CollectionReference = Awaited<ReturnType<typeof getCollection>>["references"][number];

// One collection: name, project and description above its references in the owner's
// order. Arrows move a reference one place up or down, the cross takes it out of the
// collection (the reference itself stays). References are added from their detail view.
// "Color Scheme daraus" opens the generator with the collection as its pool.
function CollectionDetail() {
  const { collection, tags } = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Runs one change, then reloads the collection; `done` replaces the reload, e.g. to leave after deleting. */
  async function change(action: () => Promise<unknown>, done = () => router.invalidate()) {
    setPending(true);
    setFailed(false);
    try {
      await action();
      await done();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  function move(index: number, offset: -1 | 1) {
    const slugs = collection.references.map((reference) => reference.slug);
    const [moved] = slugs.splice(index, 1);
    if (!moved) return;
    slugs.splice(index + offset, 0, moved);
    return change(() => setCollectionOrder({ data: { collection: collection.slug, references: slugs } }));
  }

  function remove() {
    const question = m.collection_delete_confirm({ name: collection.name });
    if (!window.confirm(question)) return;
    return change(
      () => deleteCollection({ data: { slug: collection.slug } }),
      () => router.navigate({ to: "/collections" }),
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pt-2 pb-16 sm:px-8">
      <Link to="/collections" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> {m.collections_title()}</Link>

      {editing ? (
        <div className="mt-4">
          <h1 className="sr-only">{m.edit_named({ name: collection.name })}</h1>
          <CollectionForm
            collection={collection}
            tags={tags}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              await router.invalidate();
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <header className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{collection.name}</h1>
          {collection.project && (
            <p className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
              {m.field_project()}<Link
                to="/"
                search={{ tag: collection.project }}
                className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-neutral-800 ring-1 ring-neutral-200 ring-inset hover:bg-neutral-200"
              >
                {collection.project}
              </Link>
            </p>
          )}
          {collection.description && (
            <p className="mt-3 max-w-prose text-[15px] leading-relaxed whitespace-pre-line text-neutral-700">
              {collection.description}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              to="/"
              search={{ collection: collection.slug }}
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
            >
              <ListFilter aria-hidden className="size-4" strokeWidth={1.75} />
              {m.collection_show_gallery()}</Link>
            <Link
              to="/generator"
              search={{ pool: poolValue({ kind: "collection", slug: collection.slug }) }}
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
            >
              <Palette aria-hidden className="size-4" strokeWidth={1.75} />
              {m.scheme_from_reference()}</Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
            >
              {m.action_edit()}</button>
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="ml-auto rounded-md px-2.5 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              {m.collection_delete()}</button>
          </div>
        </header>
      )}

      {failed && (
        <p role="alert" className="mt-6 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {m.action_failed()}</p>
      )}

      {collection.references.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="font-medium text-neutral-900">{m.gallery_empty()}</p>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-neutral-500">
            {m.collection_empty_help()}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900">
            {m.gallery_back()}</Link>
        </div>
      ) : (
        <>
          <ol className="mt-8 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {collection.references.map((reference, index) => (
              <ReferenceRow
                key={reference.slug}
                reference={reference}
                position={index + 1}
                disabled={pending}
                onUp={index > 0 ? () => move(index, -1) : undefined}
                onDown={index < collection.references.length - 1 ? () => move(index, 1) : undefined}
                onRemove={() =>
                  change(() =>
                    removeReferenceFromCollection({ data: { collection: collection.slug, reference: reference.slug } }),
                  )
                }
              />
            ))}
          </ol>
          <p className="mt-3 text-xs text-neutral-500">
            {m.collection_order_help()}</p>
        </>
      )}
    </main>
  );
}

const iconButtonClassName =
  "flex size-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-30";

/** One reference in the list: position, thumbnail, title with status, and the arrows and cross. */
function ReferenceRow({
  reference,
  position,
  disabled,
  onUp,
  onDown,
  onRemove,
}: {
  reference: CollectionReference;
  position: number;
  disabled: boolean;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 p-2.5 pr-2 sm:gap-4 sm:p-3">
      <span className="w-5 shrink-0 text-right text-sm text-neutral-400 tabular-nums">{position}</span>
      <Link to="/references/$slug" params={{ slug: reference.slug }} className="group flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        {reference.thumbUrl ? (
          <img
            src={reference.thumbUrl}
            alt=""
            loading="lazy"
            className="aspect-[16/10] w-20 shrink-0 rounded-md bg-neutral-200 object-cover object-top ring-1 ring-black/5 sm:w-28"
          />
        ) : (
          <div className="aspect-[16/10] w-20 shrink-0 rounded-md bg-neutral-200 sm:w-28" />
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {/* Two lines before cutting off, so titles stay readable next to the arrows on phones. */}
            <span className="line-clamp-2 min-w-0 text-sm font-medium break-words text-neutral-800 group-hover:text-neutral-950">
              {reference.title}
            </span>
            {reference.isFavorite && <FavoriteStar filled className="size-3.5 shrink-0 text-amber-500" />}
          </span>
          {reference.curationStatus !== "approved" && (
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                reference.curationStatus === "draft" ? "bg-amber-100 text-amber-900" : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {statusLabels[reference.curationStatus]}
            </span>
          )}
        </span>
      </Link>
      <div className="flex shrink-0 items-center">
        <button type="button" disabled={disabled || !onUp} onClick={onUp} aria-label={m.collection_move_up()} title={m.collection_move_up()} className={iconButtonClassName}>
          <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          disabled={disabled || !onDown}
          onClick={onDown}
          aria-label={m.collection_move_down()}
          title={m.collection_move_down()}
          className={iconButtonClassName}
        >
          <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={m.collection_remove_reference()}
          title={m.collection_remove_reference()}
          className={`${iconButtonClassName} hover:bg-rose-50 hover:text-rose-700`}
        >
          <X aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}
