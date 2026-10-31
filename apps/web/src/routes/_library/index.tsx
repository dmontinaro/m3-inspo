import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Layers, ListFilter, Smartphone } from "lucide-react";
import { z } from "zod";
import type { CurationStatus } from "@m3-inspo/db/library-schema";
import { FavoriteStar } from "#/components/favorite-star";
import { useDismiss } from "#/components/use-dismiss";
import { curationStatuses, deviceLabels, devices, statusLabels } from "#/lib/curation";
import { stackCollections } from "#/lib/gallery-stacks";
import type { GalleryItem } from "#/lib/gallery-stacks";
import { getCollections } from "#/server/collections.functions";
import { listGallery, listTags } from "#/server/library.functions";

/** Gallery filters live in the URL, so a filtered view can be reloaded and bookmarked. */
const gallerySearch = z.object({
  status: z.enum(curationStatuses).optional().catch(undefined),
  favorites: z.boolean().optional().catch(undefined),
  device: z.enum(devices).optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  /** Slug of a collection; the gallery then shows its references in the collection's order. */
  collection: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_library/")({
  validateSearch: gallerySearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [references, tags, collections] = await Promise.all([
      listGallery({
        data: {
          status: deps.status,
          favorites: deps.favorites,
          device: deps.device,
          tag: deps.tag,
          collection: deps.collection,
          query: deps.q,
        },
      }),
      listTags(),
      getCollections(),
    ]);
    return { references, tags, collections };
  },
  component: Gallery,
});

type GalleryReference = Awaited<ReturnType<typeof listGallery>>[number];
type ListedCollection = Awaited<ReturnType<typeof getCollections>>[number];

/** Tags shown on a tile; the rest are counted. */
const tileTagLimit = 3;

// Grid of references, newest first (in the collection's order when filtered by one),
// above it search and filters. Tiles are 16:10 crops
// from the top of each image, with the owner's tags below the title; a tag filters the
// gallery by it. A mobile reference shows its whole screen in a phone frame inside the same tile. Without a status filter the gallery shows everything but the archive.
// Without any filter, the references of each collection lie as one stack that opens the
// collection; any filter or search spreads them out again as single tiles.
function Gallery() {
  const { references, collections } = Route.useLoaderData();
  const search = Route.useSearch();
  const filtered =
    search.status !== undefined ||
    search.favorites === true ||
    Boolean(search.device) ||
    Boolean(search.tag) ||
    Boolean(search.collection) ||
    Boolean(search.q);

  if (references.length === 0 && !filtered) return <EmptyLibrary />;
  const items: GalleryItem<GalleryReference, ListedCollection>[] = filtered
    ? references.map((reference) => ({ kind: "reference", reference }))
    : stackCollections(references, collections);

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-4 pb-16 sm:px-8">
      <h1 className="sr-only">Galerie</h1>
      <GalleryToolbar />

      {references.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-medium text-neutral-900">Keine Referenzen gefunden</p>
          <p className="mt-1 text-[15px] text-neutral-500">Versuche ein anderes Wort oder einen anderen Filter.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900">
            Filter zurücksetzen
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((item, index) =>
            item.kind === "stack" ? (
              <li key={`stack:${item.collection.slug}`}>
                <CollectionStack collection={item.collection} eager={index < 8} />
              </li>
            ) : (
              <li key={item.reference.slug}>
                <ReferenceTile reference={item.reference} eager={index < 8} />
              </li>
            ),
          )}
        </ul>
      )}
    </main>
  );
}

/** A reference as a tile: its thumbnail with status and favorite marks, the title and its first tags. */
function ReferenceTile({ reference, eager }: { reference: GalleryReference; eager: boolean }) {
  return (
    <>
      <Link to="/referenzen/$slug" params={{ slug: reference.slug }} className="group block">
        <div className="relative overflow-hidden rounded-lg bg-neutral-200 ring-1 ring-black/5 transition-shadow group-hover:shadow-lg group-hover:shadow-black/10">
          {reference.device === "mobile" ? (
            <PhoneScreen url={reference.previewUrl} eager={eager} />
          ) : (
            <img
              src={reference.thumbUrl}
              alt=""
              width={960}
              height={600}
              loading={eager ? "eager" : "lazy"}
              className="aspect-[16/10] w-full object-cover object-top"
            />
          )}
          <TileMarks status={reference.curationStatus} isFavorite={reference.isFavorite} />
        </div>
        <p className="mt-2.5 truncate text-sm font-medium text-neutral-800 group-hover:text-neutral-950">{reference.title}</p>
      </Link>
      {reference.tags.length > 0 && (
        <ul aria-label="Tags" className="mt-1.5 flex flex-wrap items-center gap-1">
          {reference.tags.slice(0, tileTagLimit).map((tag) => (
            <li key={tag}>
              <Link
                from={Route.fullPath}
                search={(previous) => ({ ...previous, tag })}
                className="block rounded-full bg-neutral-200/60 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
              >
                {tag}
              </Link>
            </li>
          ))}
          {reference.tags.length > tileTagLimit && (
            <li className="px-1 text-xs text-neutral-400">{`+${reference.tags.length - tileTagLimit}`}</li>
          )}
        </ul>
      )}
    </>
  );
}

/**
 * A mobile reference inside the 16:10 tile: the whole screen in a phone frame
 * that rises from the bottom edge, on a blurred copy of the same screen, with
 * a "Mobile" mark. Uses the preview, since the thumbnail is cut to 16:10.
 */
function PhoneScreen({ url, eager }: { url: string; eager: boolean }) {
  const loading = eager ? "eager" : "lazy";
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden">
      <img aria-hidden src={url} alt="" loading={loading} className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-2xl" />
      <div className="absolute top-[9%] left-1/2 w-[34%] -translate-x-1/2 rounded-[1.4rem] bg-neutral-950 p-1 shadow-xl shadow-black/25 ring-1 ring-white/10 transition-transform group-hover:-translate-y-1">
        <img src={url} alt="" loading={loading} className="aspect-[9/19.5] w-full rounded-[1.15rem] object-cover object-top" />
      </div>
      <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/5">
        <Smartphone aria-hidden className="size-3.5" strokeWidth={2} />
        {deviceLabels.mobile}
      </span>
    </div>
  );
}

/**
 * Cards peeking out above a stack, back to front: which of the collection's
 * thumbnails they show and how far they are inset and lifted, at rest and on hover.
 */
const stackLayers = [
  { thumb: 2, className: "inset-x-6 -top-4 bottom-4 group-hover:-translate-y-1.5" },
  { thumb: 1, className: "inset-x-3 -top-2 bottom-2 group-hover:-translate-y-0.5" },
];

/**
 * A collection as a stack of cards: its first reference (in the owner's
 * order) on top, the next two peeking out behind it, then name and size.
 * Opens the collection. The stack keeps the tile's height, the back cards
 * reach into the gap above, so rows stay aligned.
 */
function CollectionStack({ collection, eager }: { collection: ListedCollection; eager: boolean }) {
  const cover = collection.thumbUrls[0];
  return (
    <Link to="/sammlungen/$slug" params={{ slug: collection.slug }} className="group block">
      <div className="relative">
        {stackLayers.map(({ thumb, className }) => {
          const url = collection.thumbUrls[thumb];
          return (
            <div
              key={thumb}
              aria-hidden
              className={`absolute overflow-hidden rounded-lg bg-neutral-300 ring-1 ring-black/10 transition-transform ${className}`}
            >
              {url && <img src={url} alt="" loading="lazy" className="size-full object-cover object-top brightness-90" />}
            </div>
          );
        })}
        <div className="relative overflow-hidden rounded-lg bg-neutral-200 shadow-md ring-1 shadow-black/10 ring-black/5 transition-shadow group-hover:shadow-lg group-hover:shadow-black/15">
          {cover ? (
            <img
              src={cover}
              alt=""
              width={960}
              height={600}
              loading={eager ? "eager" : "lazy"}
              className="aspect-[16/10] w-full object-cover object-top"
            />
          ) : (
            <div className="aspect-[16/10]" />
          )}
          <span className="absolute right-2.5 bottom-2.5 flex items-center gap-1 rounded-full bg-neutral-900/80 px-2 py-0.5 text-xs font-medium text-white tabular-nums shadow-sm">
            <Layers aria-hidden className="size-3.5" strokeWidth={2} />
            {collection.count}
          </span>
        </div>
      </div>
      <p className="mt-2.5 truncate text-sm font-medium text-neutral-800 group-hover:text-neutral-950">{collection.name}</p>
      <p className="mt-1 text-xs text-neutral-500">
        Sammlung · {collection.count === 1 ? "1 Referenz" : `${collection.count} Referenzen`}
      </p>
    </Link>
  );
}

const statusFilters: { status: CurationStatus | undefined; label: string }[] = [
  { status: undefined, label: "Alle" },
  { status: "draft", label: "Entwürfe" },
  { status: "approved", label: "Freigegeben" },
  { status: "archived", label: "Archiv" },
];

/**
 * Search field and filters. The search text reaches the URL (and the server)
 * a moment after typing stops; status and favorite apply on click. A
 * format, collection or tag filter (set in the filter menu, from a tag on a tile or
 * from the detail views) shows as a chip that removes it.
 */
function GalleryToolbar() {
  const { collections } = Route.useLoaderData();
  const search = Route.useSearch();
  const collectionName = collections.find((collection) => collection.slug === search.collection)?.name;
  const navigate = useNavigate({ from: Route.fullPath });
  const [query, setQuery] = useState(search.q ?? "");
  const sentQuery = useRef(search.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A search changed from outside (reset link, browser back) replaces the text; our own updates do not.
  useEffect(() => {
    if (search.q === sentQuery.current) return;
    sentQuery.current = search.q;
    setQuery(search.q ?? "");
  }, [search.q]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function changeQuery(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      sentQuery.current = value.trim() || undefined;
      void navigate({ search: (previous) => ({ ...previous, q: sentQuery.current }), replace: true });
    }, 250);
  }

  return (
    // Phones: search and favorites share the first row, the status switch spans the second.
    <div className="flex flex-wrap items-center gap-2 md:gap-3">
      <label className="relative block min-w-0 flex-1 md:w-80 md:flex-none">
        <span className="sr-only">Suchen</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 fill-none stroke-neutral-400 stroke-2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Titel, Notizen und Tags durchsuchen"
          className="block w-full rounded-md border border-neutral-300 bg-white py-2 pr-3 pl-9 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus:outline-none"
        />
      </label>

      <div
        role="group"
        aria-label="Status"
        className="order-last grid w-full grid-cols-4 rounded-lg bg-neutral-200/70 p-1 md:order-none md:flex md:w-auto"
      >
        {statusFilters.map(({ status, label }) => (
          <Link
            key={label}
            from={Route.fullPath}
            search={(previous) => ({ ...previous, status })}
            activeOptions={{ exact: true }}
            className="rounded-md px-3 py-1.5 text-center text-sm whitespace-nowrap text-neutral-600 hover:text-neutral-900 aria-[current=page]:bg-white aria-[current=page]:font-medium aria-[current=page]:text-neutral-900 aria-[current=page]:shadow-sm max-sm:px-1"
          >
            {label}
          </Link>
        ))}
      </div>

      <Link
        from={Route.fullPath}
        search={(previous) => ({ ...previous, favorites: search.favorites ? undefined : true })}
        aria-current={search.favorites ? "true" : undefined}
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap text-neutral-600 ring-1 ring-neutral-300 ring-inset hover:text-neutral-900 aria-[current=true]:bg-amber-50 aria-[current=true]:font-medium aria-[current=true]:text-amber-900 aria-[current=true]:ring-amber-300"
      >
        <FavoriteStar filled={search.favorites === true} className="size-4 text-amber-500" />
        Favoriten
      </Link>

      {search.device && (
        <Link
          from={Route.fullPath}
          search={(previous) => ({ ...previous, device: undefined })}
          title="Format-Filter entfernen"
          className={chipClassName}
        >
          <ChipContent kind="Format" value={deviceLabels[search.device]} />
        </Link>
      )}

      {search.collection && (
        <Link
          from={Route.fullPath}
          search={(previous) => ({ ...previous, collection: undefined })}
          title="Sammlungs-Filter entfernen"
          className={chipClassName}
        >
          <ChipContent kind="Sammlung" value={collectionName ?? search.collection} />
        </Link>
      )}

      {search.tag && (
        <Link
          from={Route.fullPath}
          search={(previous) => ({ ...previous, tag: undefined })}
          title="Tag-Filter entfernen"
          className={chipClassName}
        >
          <ChipContent kind="Tag" value={search.tag} />
        </Link>
      )}

      <FilterMenu />
    </div>
  );
}

const chipClassName =
  "order-last flex max-w-full min-w-0 shrink-0 items-center gap-2 rounded-lg bg-neutral-900 py-2.5 pr-2.5 pl-3 text-sm whitespace-nowrap text-white hover:bg-neutral-700 md:order-none";

/** Inside an active-filter chip: what kind of filter, its value and the cross that removes it. */
function ChipContent({ kind, value }: { kind: string; value: string }) {
  return (
    <>
      <span className="text-neutral-400">{kind}</span>
      <span className="truncate font-medium">{value}</span>
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-none stroke-current stroke-2 text-neutral-400">
        <path d="m4.5 4.5 7 7m0-7-7 7" strokeLinecap="round" />
      </svg>
      <span className="sr-only">entfernen</span>
    </>
  );
}

const menuItemClassName =
  "flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 aria-[current=true]:font-medium aria-[current=true]:text-neutral-950";

/**
 * Filter icon button on the right of the toolbar, with a dot while a
 * format, collection or tag filter is active. Opens a menu with a section per
 * filter: the formats, collections alphabetically with their count, then the
 * tags in use, most used first. Picking an entry filters the gallery; "Alle …" clears that
 * section's filter.
 */
function FilterMenu() {
  const { tags, collections } = Route.useLoaderData();
  const search = Route.useSearch();
  const [open, setOpen] = useState(false);
  const container = useDismiss(open, setOpen);
  const active = Boolean(search.device || search.tag || search.collection);
  const close = () => setOpen(false);

  return (
    <div ref={container} className="relative shrink-0 md:ml-auto">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Filtern"
        title="Nach Format, Sammlung oder Tag filtern"
        className={`relative flex size-10.5 items-center justify-center rounded-lg hover:bg-neutral-200/60 hover:text-neutral-900 ${
          active ? "text-neutral-900" : "text-neutral-500"
        }`}
      >
        <ListFilter aria-hidden className="size-5" strokeWidth={1.75} />
        {/* A dot marks an active format, collection or tag filter while the menu is closed. */}
        {active && <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-neutral-900 ring-2 ring-stone-50" />}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 max-h-[min(32rem,70vh)] w-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg shadow-black/10">
          <MenuSection title="Format" empty={false}>
            <li>
              <Link
                from={Route.fullPath}
                search={(previous) => ({ ...previous, device: undefined })}
                onClick={close}
                className={menuItemClassName}
              >
                Alle Formate
                {!search.device && <Check aria-hidden className="size-4 text-neutral-900" />}
              </Link>
            </li>
            {devices.map((device) => (
              <li key={device}>
                <Link
                  from={Route.fullPath}
                  search={(previous) => ({ ...previous, device })}
                  onClick={close}
                  aria-current={search.device === device ? "true" : undefined}
                  className={menuItemClassName}
                >
                  {deviceLabels[device]}
                  {search.device === device && <Check aria-hidden className="size-4 shrink-0 text-neutral-900" />}
                </Link>
              </li>
            ))}
          </MenuSection>

          <div className="mx-2.5 my-1.5 border-t border-neutral-100" />

          <MenuSection title="Sammlungen" empty={collections.length === 0 && "Noch keine Sammlungen."}>
            <li>
              <Link
                from={Route.fullPath}
                search={(previous) => ({ ...previous, collection: undefined })}
                onClick={close}
                className={menuItemClassName}
              >
                Alle Sammlungen
                {!search.collection && <Check aria-hidden className="size-4 text-neutral-900" />}
              </Link>
            </li>
            {collections.map((collection) => (
              <li key={collection.slug}>
                <Link
                  from={Route.fullPath}
                  search={(previous) => ({ ...previous, collection: collection.slug })}
                  onClick={close}
                  aria-current={search.collection === collection.slug ? "true" : undefined}
                  className={menuItemClassName}
                >
                  <span className="truncate">{collection.name}</span>
                  {search.collection === collection.slug ? (
                    <Check aria-hidden className="size-4 shrink-0 text-neutral-900" />
                  ) : (
                    <span className="shrink-0 text-xs font-normal text-neutral-400 tabular-nums">{collection.count}</span>
                  )}
                </Link>
              </li>
            ))}
          </MenuSection>

          <div className="mx-2.5 my-1.5 border-t border-neutral-100" />

          <MenuSection title="Tags" empty={tags.length === 0 && "Noch keine Tags vergeben."}>
            <li>
              <Link
                from={Route.fullPath}
                search={(previous) => ({ ...previous, tag: undefined })}
                onClick={close}
                className={menuItemClassName}
              >
                Alle Tags
                {!search.tag && <Check aria-hidden className="size-4 text-neutral-900" />}
              </Link>
            </li>
            {tags.map((tag) => (
              <li key={tag}>
                <Link
                  from={Route.fullPath}
                  search={(previous) => ({ ...previous, tag })}
                  onClick={close}
                  aria-current={search.tag === tag ? "true" : undefined}
                  className={menuItemClassName}
                >
                  <span className="truncate">{tag}</span>
                  {search.tag === tag && <Check aria-hidden className="size-4 shrink-0 text-neutral-900" />}
                </Link>
              </li>
            ))}
          </MenuSection>
        </div>
      )}
    </div>
  );
}

/** One section of the filter menu: a small heading, then its entries or the `empty` hint. */
function MenuSection({ title, empty, children }: { title: string; empty: string | false; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-2.5 pt-1.5 pb-2 text-xs font-medium tracking-wide text-neutral-400 uppercase">{title}</h2>
      {empty ? <p className="px-2.5 pb-2 text-sm text-neutral-500">{empty}</p> : <ul>{children}</ul>}
    </section>
  );
}

/** Small marks on a tile: the status when it is not the normal "approved", and a star for favorites. */
function TileMarks({ status, isFavorite }: { status: CurationStatus; isFavorite: boolean }) {
  return (
    <>
      {status !== "approved" && (
        <span
          className={`absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm ring-1 ring-black/5 ${
            status === "draft" ? "bg-amber-100 text-amber-900" : "bg-neutral-100 text-neutral-700"
          }`}
        >
          {statusLabels[status]}
        </span>
      )}
      {isFavorite && (
        <span className="absolute top-2 right-2 rounded-full bg-white/90 p-1 text-amber-500 shadow-sm ring-1 ring-black/5">
          <FavoriteStar filled className="size-4" />
          <span className="sr-only">Favorit</span>
        </span>
      )}
    </>
  );
}

function EmptyLibrary() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <h1 className="text-xl font-semibold">Noch keine Referenzen</h1>
      <p className="mt-2 text-neutral-600">
        Lade einen Screenshot hoch, der dir gefällt, oder füge ihn mit Strg+V bzw. ⌘V direkt hier ein. Dann notiere,
        was davon übernommen werden soll.
      </p>
      <Link
        to="/hochladen"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Erstes Bild hochladen
      </Link>
    </main>
  );
}
