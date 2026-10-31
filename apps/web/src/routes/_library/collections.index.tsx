import { formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { CollectionForm } from "#/components/collection-form";
import { getCollections } from "#/server/collections.functions";
import { listTags } from "#/server/library.functions";

export const Route = createFileRoute("/_library/collections/")({
  head: () => ({ meta: [{ title: m.collections_page_title() }] }),
  loader: async () => {
    const [collections, tags] = await Promise.all([getCollections(), listTags()]);
    return { collections, tags };
  },
  component: Collections,
});

type ListedCollection = Awaited<ReturnType<typeof getCollections>>[number];

// The owner's collections as cards, alphabetically, with "Neue Sammlung" opening the
// form above them. A new collection opens right away, ready to be filled from the detail views.
function Collections() {
  const { collections, tags } = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const form = (
    <CollectionForm
      tags={tags}
      onCancel={() => setCreating(false)}
      onSaved={(slug) => navigate({ to: "/collections/$slug", params: { slug } })}
    />
  );

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-16 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{m.collections_title()}</h1>
        {!creating && collections.length > 0 && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
          >
            <Plus aria-hidden className="size-4" strokeWidth={2} />
            {m.collection_new()}</button>
        )}
      </div>

      {collections.length === 0 ? (
        <div className="mx-auto max-w-xl py-16">
          {creating ? (
            form
          ) : (
            <div className="text-center">
              <p className="font-medium text-neutral-900">{m.collections_empty()}</p>
              <p className="mt-1 text-[15px] text-neutral-500">
                {m.collections_empty_help()}</p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-5 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
              >
                {m.collection_create_first()}</button>
            </div>
          )}
        </div>
      ) : (
        <>
          {creating && <div className="mt-6 max-w-3xl">{form}</div>}
          <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {collections.map((collection) => (
              <li key={collection.slug}>
                <CollectionCard collection={collection} />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

const referenceCount = (count: number) => m.reference_count({ count, formattedCount: formatNumber(count) });

/** A 2 × 2 mosaic of the first references' thumbnails, name, count, project and description. */
function CollectionCard({ collection }: { collection: ListedCollection }) {
  return (
    <Link to="/collections/$slug" params={{ slug: collection.slug }} className="group block">
      <div className="grid aspect-[16/10] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/5 transition-shadow group-hover:shadow-lg group-hover:shadow-black/10">
        {[0, 1, 2, 3].map((index) => {
          const url = collection.thumbUrls[index];
          return url ? (
            <img key={index} src={url} alt="" loading="lazy" className="size-full object-cover object-top" />
          ) : (
            <div key={index} className="bg-neutral-200/50" />
          );
        })}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium text-neutral-800 group-hover:text-neutral-950">{collection.name}</p>
        <p className="shrink-0 text-xs text-neutral-500">{referenceCount(collection.count)}</p>
      </div>
      {(collection.project || collection.description) && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-neutral-500">
          {collection.project && (
            <span className="mr-1.5 inline-block rounded-full bg-neutral-200/60 px-2 py-px text-xs text-neutral-600">
              {collection.project}
            </span>
          )}
          {collection.description}
        </p>
      )}
    </Link>
  );
}
