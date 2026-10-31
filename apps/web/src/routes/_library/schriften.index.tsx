import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { StandInBadge, useFontFaces } from "#/components/font-faces";
import { heaviest, roleEntries } from "#/components/pairing-poster";
import { sampleTexts } from "#/lib/fonts";
import { getTypePairings } from "#/server/type-pairings.functions";

export const Route = createFileRoute("/_library/schriften/")({
  head: () => ({ meta: [{ title: "Schriften · m3 inspo" }] }),
  loader: () => getTypePairings(),
  component: TypePairings,
});

// The owner's type pairings, newest first, as cards like the gallery's, each linking to its poster.
// Size slider, search and archive follow (#65).
function TypePairings() {
  const pairings = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-16 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Schriften</h1>
        {pairings.length > 0 && (
          <Link
            to="/schriften/neu"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
          >
            <Plus aria-hidden className="size-4" strokeWidth={2} />
            Neues Pairing
          </Link>
        )}
      </div>

      {pairings.length === 0 ? (
        <div className="mx-auto max-w-xl py-16 text-center">
          <p className="font-medium text-neutral-900">Noch keine Type Pairings</p>
          <p className="mt-1 text-[15px] text-neutral-500">
            Merk dir Schriftkombinationen, die dir gefallen: je eine Schrift für Überschrift und Fließtext, optional Mono.
          </p>
          <Link
            to="/schriften/neu"
            className="mt-5 inline-block rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Erstes Pairing anlegen
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {pairings.map((pairing) => (
            <li key={pairing.slug}>
              <PairingCard pairing={pairing} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

type ListedPairing = ReturnType<typeof Route.useLoaderData>[number];

/**
 * A pairing as a tile: a specimen in its own fonts (the heading sample in
 * the heading's boldest weight, the body sample below), then its name and
 * families. Families the page cannot load show a stand-in and its badge.
 */
function PairingCard({ pairing }: { pairing: ListedPairing }) {
  const { heading, body } = pairing.roles;
  const { fontStyle } = useFontFaces([heading, body]);
  const families = [...new Set(roleEntries(pairing.roles).map(({ font }) => font.family))];

  return (
    <Link to="/schriften/$slug" params={{ slug: pairing.slug }} className="group block">
      <div className="relative flex aspect-[16/10] flex-col justify-between gap-4 overflow-hidden rounded-lg bg-white p-5 ring-1 ring-black/5 transition-shadow group-hover:shadow-lg group-hover:shadow-black/10 sm:p-6">
        <p className="line-clamp-2 text-[1.75rem] leading-[1.05] tracking-tight text-neutral-950" style={fontStyle(heading, heaviest(heading))}>
          {sampleTexts.heading}
        </p>
        <p className="line-clamp-3 text-sm leading-relaxed text-neutral-600" style={fontStyle(body)}>
          {sampleTexts.body}
        </p>
        <span className="absolute top-2.5 right-2.5 flex gap-1">
          <StandInBadge font={heading} />
          {body.family !== heading.family && <StandInBadge font={body} />}
        </span>
      </div>
      <p className="mt-2.5 truncate text-sm font-medium text-neutral-800 group-hover:text-neutral-950">{pairing.name}</p>
      <p className="mt-0.5 truncate text-xs text-neutral-500">{families.join(" + ")}</p>
    </Link>
  );
}
