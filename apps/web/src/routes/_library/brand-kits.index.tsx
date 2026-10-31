import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Shuffle } from "lucide-react";
import { KitDeleteButton } from "#/components/brand-kits/kit-lifecycle";
import { KitStatus, ProjectChip } from "#/components/brand-kits/parts";
import { getBrandKits } from "#/server/brand-kits.functions";

export const Route = createFileRoute("/_library/brand-kits/")({
  head: () => ({ meta: [{ title: "Brand Kits · m3 inspo" }] }),
  loader: () => getBrandKits(),
  component: BrandKits,
});

type ListedKit = Awaited<ReturnType<typeof getBrandKits>>[number];

// The owner's Brand Kits, the last saved first, each as its colours with name, status and
// project. Archived kits wait folded away at the end. "Neues Color Scheme" opens the
// generator with every approved reference as the pool.
function BrandKits() {
  const kits = Route.useLoaderData();
  const active = kits.filter((kit) => kit.status !== "archived");
  const archived = kits.filter((kit) => kit.status === "archived");

  const newScheme = (
    <Link
      to="/generator"
      className="inline-flex shrink-0 items-center gap-2 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
    >
      <Shuffle aria-hidden className="size-4" strokeWidth={2} />
      Neues Color Scheme
    </Link>
  );

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-16 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Brand Kits</h1>
        {kits.length > 0 && newScheme}
      </div>

      {kits.length === 0 ? (
        <div className="mx-auto max-w-xl py-16 text-center">
          <p className="font-medium text-neutral-900">Noch keine Brand Kits</p>
          <p className="mt-1 mb-5 text-[15px] text-neutral-500">
            Erwürfle ein Color Scheme aus den gemessenen Farben deiner Referenzen. Sperre, was bleiben soll, und würfle weiter, bis es
            passt. Dann speicherst du es als Brand Kit.
          </p>
          {newScheme}
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <KitGrid kits={active} />
          ) : (
            <p className="mt-6 text-[15px] text-neutral-500">Alle Brand Kits sind archiviert.</p>
          )}
          {archived.length > 0 && (
            <details className="group mt-12 border-t border-neutral-200 pt-5">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-neutral-600 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 [&::-webkit-details-marker]:hidden">
                Archiviert
                <span className="font-normal text-neutral-400">{archived.length}</span>
                <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.75} />
              </summary>
              <KitGrid kits={archived} />
            </details>
          )}
        </>
      )}
    </main>
  );
}

function KitGrid({ kits }: { kits: ListedKit[] }) {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {kits.map((kit) => (
        <li key={kit.slug} className="group/card relative">
          <KitCard kit={kit} />
          <KitDeleteButton kit={kit} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The kit's source colours side by side, the brand twice as wide, with its
 * `primary` as a button-shaped sample; name, status and project below. Opens
 * the kit rolling on from its project's references.
 */
function KitCard({ kit }: { kit: ListedKit }) {
  const { brand, neutral, extras, primary, onPrimary } = kit.colors;
  const bands = [
    { key: "brand", hex: brand, grow: "flex-[2]" },
    { key: "neutral", hex: neutral, grow: "flex-1" },
    ...extras.map(({ name, hex }) => ({ key: name, hex, grow: "flex-1" })),
  ];

  return (
    <Link
      to="/brand-kits/$slug"
      params={{ slug: kit.slug }}
      search={kit.project ? { pool: `project:${kit.project}` } : {}}
      className="group block"
    >
      <div className="relative flex aspect-[16/10] overflow-hidden rounded-lg ring-1 ring-black/5 transition-shadow group-hover:shadow-lg group-hover:shadow-black/10">
        {bands.map((band) => (
          <span key={band.key} className={`${band.grow} min-w-0`} style={{ background: band.hex }} />
        ))}
        <span
          className="absolute bottom-3 left-3 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm"
          style={{ background: primary, color: onPrimary }}
        >
          primary
        </span>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium text-neutral-800 group-hover:text-neutral-950">{kit.name}</p>
        <KitStatus status={kit.status} />
      </div>
      {kit.project && (
        <p className="mt-1">
          <ProjectChip project={kit.project} />
        </p>
      )}
    </Link>
  );
}
