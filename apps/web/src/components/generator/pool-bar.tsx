import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Pool } from "@m3-inspo/shared/color-scheme";
import type { PoolData } from "#/lib/generator";
import { useDismiss } from "../use-dismiss";

/** How many thumbnails the strip shows; the count next to it names them all. */
const MAX_THUMBNAILS = 24;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function poolLabel(pool: Pool, data: PoolData): string {
  switch (pool.kind) {
    case "all":
      return "Alle Referenzen";
    case "project":
      return `Projekt ${pool.tag}`;
    case "collection":
      return data.collections.find((collection) => collection.slug === pool.slug)?.name ?? pool.slug;
    case "references":
      // The references the library knows; unknown slugs are reported, not counted.
      return data.references.length === 1 ? data.references[0].title : count(data.references.length, "Referenz", "Referenzen");
  }
}

const samePool = (a: Pool, b: Pool) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Where rolls draw from: a menu "Würfeln aus: Alle · Projekt … · Sammlung …"
 * and the pool's references as thumbnails. Without measured colours it says
 * that rolls are free, without a reference.
 */
export function PoolBar({ pool, data, onChange }: { pool: Pool; data: PoolData; onChange: (pool: Pool) => void }) {
  const [open, setOpen] = useState(false);
  const container = useDismiss(open, setOpen);
  const choose = (next: Pool) => {
    setOpen(false);
    if (!samePool(next, pool)) onChange(next);
  };
  const shown = data.references.slice(0, MAX_THUMBNAILS);

  const option = (next: Pool, label: string) => (
    <button
      key={label}
      type="button"
      role="menuitemradio"
      aria-checked={samePool(next, pool)}
      onClick={() => choose(next)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
    >
      <span className="truncate">{label}</span>
      {samePool(next, pool) && <Check aria-hidden className="size-4 shrink-0 text-neutral-900" strokeWidth={2} />}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div ref={container} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex max-w-full items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          <span className="text-neutral-500">Würfeln aus</span>
          <span className="truncate font-medium text-neutral-900">{poolLabel(pool, data)}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-neutral-500" strokeWidth={2} />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute left-0 z-30 mt-2 max-h-96 w-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg shadow-black/10"
          >
            {option({ kind: "all" }, "Alle Referenzen")}
            {data.projects.length > 0 && <p className="px-2.5 pt-3 pb-1 text-xs text-neutral-500">Projekte</p>}
            {data.projects.map((tag) => option({ kind: "project", tag }, tag))}
            {data.collections.length > 0 && <p className="px-2.5 pt-3 pb-1 text-xs text-neutral-500">Sammlungen</p>}
            {data.collections.map(({ slug, name }) => option({ kind: "collection", slug }, name))}
          </div>
        )}
      </div>

      {data.colors.length === 0 ? (
        <p className="text-sm text-neutral-500">Keine gemessenen Farben im Pool: Gewürfelt wird frei, ohne Referenz.</p>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <ul className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label="Referenzen im Pool">
            {shown.map((reference) => (
              <li key={reference.id} className="shrink-0" title={reference.title}>
                {reference.thumbUrl ? (
                  <img
                    src={reference.thumbUrl}
                    alt={reference.title}
                    loading="lazy"
                    className="h-9 w-14 rounded-md bg-neutral-200 object-cover object-top ring-1 ring-black/5"
                  />
                ) : (
                  <span className="block h-9 w-14 rounded-md bg-neutral-200 ring-1 ring-black/5" />
                )}
              </li>
            ))}
          </ul>
          <p className="shrink-0 text-xs text-neutral-500 tabular-nums">
            {count(data.references.length, "Referenz", "Referenzen")} · {count(data.colors.length, "Farbe", "Farben")}
          </p>
        </div>
      )}
    </div>
  );
}
