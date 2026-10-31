import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CurationStatus } from "@m3-inspo/db/library-schema";
import type { ColorSources, CssFormat } from "@m3-inspo/shared/color-scheme";
import { maxBrandKitNotesLength } from "#/lib/brand-kits";
import { fieldClassName } from "#/lib/form-styles";
import { updateBrandKitNotes } from "#/server/brand-kits.functions";

/**
 * The kit's notes on how to use it ("Orange nur für Haupt-Aktionen"), saved
 * on their own with the button next to them, apart from the Color Scheme.
 */
export function KitNotes({ slug, notes, onSaved }: { slug: string; notes: string | null; onSaved: () => Promise<void> }) {
  const [text, setText] = useState(notes ?? "");
  const [state, setState] = useState<"idle" | "pending" | "saved" | "failed">("idle");
  const dirty = text.trim() !== (notes ?? "");

  useEffect(() => {
    if (state !== "saved") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function save() {
    setState("pending");
    try {
      await updateBrandKitNotes({ data: { slug, notes: text } });
      await onSaved();
      setState("saved");
    } catch {
      setState("failed");
    }
  }

  return (
    <section aria-labelledby="kit-notes">
      <h2 id="kit-notes" className="mb-1.5 text-base font-semibold tracking-tight">
        Hinweise
      </h2>
      <textarea
        aria-labelledby="kit-notes"
        rows={4}
        value={text}
        maxLength={maxBrandKitNotesLength}
        onChange={(event) => {
          setText(event.target.value);
          if (state !== "pending") setState("idle");
        }}
        placeholder="Wie das Kit gedacht ist, z. B. „Orange nur für Haupt-Aktionen, nie als Fläche.“"
        className={`${fieldClassName} resize-y`}
      />
      <div className="mt-2 flex min-h-8 items-center justify-between gap-3">
        <p className="text-xs text-neutral-500" role="status">
          {state === "saved"
            ? "Gespeichert."
            : state === "failed"
              ? "Das hat nicht geklappt. Bitte versuche es noch einmal."
              : "Agenten lesen die Hinweise mit, wenn das Kit freigegeben ist."}
        </p>
        {(dirty || state === "pending") && (
          <button
            type="button"
            onClick={save}
            disabled={state === "pending"}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            Hinweise speichern
          </button>
        )}
      </div>
    </section>
  );
}

type SourceReference = { id: string; slug: string; title: string; curationStatus: CurationStatus; thumbUrl: string | null };

/**
 * The references the saved colours come from, with thumbnail, link and the
 * colours taken from each. Archived ones are marked; a colour whose
 * reference was deleted keeps its value and says so.
 */
export function SourceReferences({ references, sources }: { references: SourceReference[]; sources: ColorSources }) {
  const colors = [sources.brand, sources.neutral, ...sources.extras];
  // A reference no longer linked is gone: its id may still stand in the origin, or already be cleared.
  const linked = new Set(references.map(({ id }) => id));
  const fromDeleted = colors.filter(({ origin }) => origin.kind === "reference" && !(origin.referenceId && linked.has(origin.referenceId)));

  return (
    <section aria-labelledby="kit-sources">
      <h2 id="kit-sources" className="mb-3 text-base font-semibold tracking-tight">
        Quell-Referenzen
      </h2>
      {references.length === 0 && fromDeleted.length === 0 ? (
        <p className="text-sm text-neutral-500">Keine. Die Farben sind gewürfelt oder von Hand gesetzt.</p>
      ) : (
        <ul className="divide-y divide-neutral-200/70">
          {references.map((reference) => (
            <li key={reference.id}>
              <Link
                to="/referenzen/$slug"
                params={{ slug: reference.slug }}
                className="group flex items-center gap-3 py-2 first:pt-0"
              >
                {reference.thumbUrl ? (
                  <img
                    src={reference.thumbUrl}
                    alt=""
                    loading="lazy"
                    className="h-12 w-20 shrink-0 rounded-md bg-neutral-200 object-cover object-top ring-1 ring-black/5"
                  />
                ) : (
                  <span className="h-12 w-20 shrink-0 rounded-md bg-neutral-200/60" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-800 group-hover:text-neutral-950 group-hover:underline group-hover:underline-offset-4">
                    {reference.title}
                  </span>
                  {reference.curationStatus === "archived" && <span className="text-xs text-neutral-500">archiviert</span>}
                </span>
                <Swatches hexes={colors.flatMap(({ hex, origin }) => (origin.kind === "reference" && origin.referenceId === reference.id ? [hex] : []))} />
              </Link>
            </li>
          ))}
          {fromDeleted.length > 0 && (
            <li className="flex items-center justify-between gap-3 py-2 text-sm text-neutral-500">
              Aus einer gelöschten Referenz
              <Swatches hexes={fromDeleted.map(({ hex }) => hex)} />
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function Swatches({ hexes }: { hexes: string[] }) {
  return (
    <span className="flex shrink-0 gap-1">
      {hexes.map((hex, index) => (
        <span key={index} title={hex} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: hex }} />
      ))}
    </span>
  );
}

const formats: { value: CssFormat; label: string }[] = [
  { value: "css", label: "CSS" },
  { value: "tailwind", label: "Tailwind v4" },
];

/**
 * The CSS export of the saved snapshot, to copy into a project: plain CSS
 * (the `:root` and `.dark` blocks) or for Tailwind v4 (plus `@theme inline`). Unsaved
 * changes are not in it; `unsaved` says so.
 */
export function CssExport({ css, unsaved }: { css: Record<CssFormat, string>; unsaved: boolean }) {
  const [format, setFormat] = useState<CssFormat>("tailwind");
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copy !== "copied") return;
    const timer = window.setTimeout(() => setCopy("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copy]);

  return (
    <section aria-labelledby="kit-css" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="kit-css" className="text-base font-semibold tracking-tight">
          CSS
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-neutral-200/70 p-0.5 text-sm" role="group" aria-label="Format">
            {formats.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={format === option.value}
                onClick={() => setFormat(option.value)}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  format === option.value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(css[format]);
                setCopy("copied");
              } catch {
                // No clipboard access (an insecure origin, a denied permission).
                setCopy("failed");
              }
            }}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
          >
            {copy === "copied" ? (
              <Check aria-hidden className="size-4 text-emerald-700" strokeWidth={2} />
            ) : (
              <Copy aria-hidden className="size-4" strokeWidth={2} />
            )}
            {copy === "copied" ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      </div>
      <pre className="max-h-80 overflow-auto rounded-xl bg-neutral-950 p-4 font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-xs leading-relaxed text-neutral-200 [scrollbar-color:var(--color-neutral-700)_transparent] selection:bg-neutral-700">
        {css[format]}
      </pre>
      <p className="mt-2 text-xs text-neutral-500" role="status">
        {copy === "failed"
          ? "Kopieren hat nicht geklappt. Markiere den Block und kopiere ihn von Hand."
          : unsaved
            ? "Aus dem gespeicherten Stand. Ungespeicherte Änderungen sind nicht drin."
            : "Aus dem gespeicherten Stand."}
      </p>
    </section>
  );
}
