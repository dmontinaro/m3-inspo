import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Moon, Shuffle, Sun, TriangleAlert, Undo2, X } from "lucide-react";
import { buildColorScheme } from "@m3-inspo/shared/color-scheme";
import type { Pool, PrimaryStrategy, SourceKey } from "@m3-inspo/shared/color-scheme";
import type { FontRoles } from "@m3-inspo/shared/fonts";
import { describeSkipped } from "#/lib/generator";
import type { Draft, GeneratorReference, PoolData, SkippedNotice } from "#/lib/generator";
import { parseSearch, stringifySearch } from "#/lib/search";
import { ColorPicker } from "./color-picker";
import { formatRatio } from "./parts";
import { PoolBar } from "./pool-bar";
import { SchemePreview } from "./scheme-preview";
import { SourceStrips } from "./source-strips";
import { useGenerator, useGeneratorKeys, useKnownReferences } from "./use-generator";

/** Where a generator page starts: the draft, the pool and what of its link it had to skip. */
export type GeneratorStart = { draft: Draft; pool: Pool; skipped: SkippedNotice[] };

/**
 * How long the URL waits for the steps to settle. A slider drag or a held key
 * makes dozens of steps a second, and browsers throttle history writes
 * (Chrome drops them, Safari throws), so only the settled state is written.
 */
const URL_DELAY = 250;

type PageOptions = {
  /** The page's path, e.g. `/generator`; the search part follows it. */
  path: string;
  poolData: PoolData;
  /** The start for the URL as it stands: once, and again whenever the URL changes from outside. */
  read: () => GeneratorStart;
  /** The URL search for a state, without `?`, as serializeGeneratorSearch writes it. */
  search: (draft: Draft, pool: Pool, references: readonly GeneratorReference[]) => string;
  /** While true (a dialog is open), Space and `Z` do nothing. */
  paused?: boolean;
};

/**
 * A generator page's working state, kept in step with its URL (/generator
 * and a Brand Kit's page): the undo history, the pool, the skipped parts of
 * the link and the open colour picker. Steps replace the URL once they
 * settle, so reloading restores the state and rolling adds no history
 * entries; any other URL (back button, another link) starts over from it.
 *
 * ```tsx
 * const page = useGeneratorPage({ path: "/generator", poolData, read: () => draftFromSearch(search, poolData), search: … });
 * return <GeneratorWorkspace page={page} poolData={poolData} />;
 * ```
 */
export function useGeneratorPage({ path, poolData, read, search, paused = false }: PageOptions) {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const navigate = useNavigate();

  const [start] = useState(read);
  const [pool, setPool] = useState(start.pool);
  const [skipped, setSkipped] = useState<SkippedNotice[]>(start.skipped);
  const generator = useGenerator(start.draft, poolData);
  const references = useKnownReferences(poolData);
  const [picker, setPicker] = useState<{ key: SourceKey; opener: HTMLElement } | null>(null);
  const { draft } = generator;

  // Every URL this visit wrote. The router may still show an older one of them while it commits
  // the next; any other URL (back button, another generator link) starts over from it.
  const written = useRef(new Set([searchStr]));
  const [seenSearch, setSeenSearch] = useState(searchStr);
  if (searchStr !== seenSearch) {
    setSeenSearch(searchStr);
    if (!written.current.has(searchStr)) {
      const next = read();
      generator.reset(next.draft);
      setPool(next.pool);
      setSkipped(next.skipped);
      setPicker(null);
    }
  }

  // The search string as the router shows it, to tell the page's own URL steps from outside ones.
  const target = stringifySearch(parseSearch(search(draft, pool, [...references.values()])));
  useEffect(() => {
    if (target === seenSearch) return;
    const href = `${path}${target}`;
    const timer = window.setTimeout(() => {
      written.current.add(target);
      void navigate({ href, replace: true, resetScroll: false });
    }, URL_DELAY);
    // Reloading or closing the tab within the delay: write it at once, past the router, the page is going away.
    const flush = () => window.history.replaceState(window.history.state, "", href);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [path, target, seenSearch, navigate]);

  useGeneratorKeys(generator, paused || picker !== null);
  const snapshot = useMemo(() => buildColorScheme(draft.sources, draft.primary), [draft.sources, draft.primary]);

  return { generator, draft, snapshot, pool, setPool, skipped, setSkipped, references, picker, setPicker };
}

export type GeneratorPage = ReturnType<typeof useGeneratorPage>;

/** The keyboard hints, undo and "Würfeln", for a generator page's header; `children` go first (e.g. "Speichern"). */
export function GeneratorActions({ page, children }: { page: GeneratorPage; children?: ReactNode }) {
  const { generator } = page;
  return (
    <div className="flex items-center gap-2">
      <p className="mr-2 hidden text-xs text-neutral-500 md:block">
        <Kbd>Leertaste</Kbd> würfeln · <Kbd>Z</Kbd> zurück
      </p>
      {children}
      <button
        type="button"
        onClick={generator.undo}
        disabled={!generator.canUndo}
        title="Zurück (Z)"
        aria-label="Zurück"
        className="grid size-9 place-items-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40"
      >
        <Undo2 aria-hidden className="size-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={generator.roll}
        className="flex items-center gap-2 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        <Shuffle aria-hidden className="size-4" strokeWidth={2} />
        Würfeln
      </button>
    </div>
  );
}

const primaryOptions: { value: PrimaryStrategy; label: string; hint: string }[] = [
  { value: "vivid", label: "Kräftig", hint: "primary behält den Farbton der Marke und wird gerade so dunkel, dass weißer Text 4,5 : 1 schafft" },
  { value: "hold", label: "Farbe halten", hint: "primary ist genau die Markenfarbe; der Text darauf passt sich an" },
];

/** The preview paints with the light roles or with their dark counterpart. */
const previewModes = [
  { dark: false, label: "Hell", icon: Sun },
  { dark: true, label: "Dunkel", icon: Moon },
];

/**
 * Everything of the generator below a page's header: the note on a broken
 * link, the pool, the source strips, the `primary` strategy with warnings
 * and the preview, light or dark. `children` sit between the controls and the preview (a
 * kit's notes, source references and CSS); `fonts` and `previewAside` (a
 * kit's fonts and what sets them) go to the preview.
 */
export function GeneratorWorkspace({
  page,
  poolData,
  fonts,
  previewAside,
  children,
}: {
  page: GeneratorPage;
  poolData: PoolData;
  fonts?: FontRoles | null;
  previewAside?: ReactNode;
  children?: ReactNode;
}) {
  const { generator, draft, snapshot, pool, skipped, setSkipped, references, picker, setPicker } = page;
  const onPrimary = snapshot.roles["primary-foreground"];
  const [previewDark, setPreviewDark] = useState(false);

  return (
    <>
      {skipped.length > 0 && (
        <div role="status" className="mt-5 flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Der Link war nicht ganz lesbar. Übersprungen:</p>
            <ul className="mt-0.5">
              {skipped.map((part, index) => (
                <li key={index}>{describeSkipped(part)}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setSkipped([])} aria-label="Hinweis schließen" className="rounded p-0.5 hover:bg-amber-100">
            <X aria-hidden className="size-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <div className="mt-6">
        <PoolBar
          pool={pool}
          data={poolData}
          onChange={(next) => {
            page.setPool(next);
            setSkipped((parts) => parts.filter((part) => part.param !== "pool"));
          }}
        />
      </div>

      <div className="mt-4">
        <SourceStrips
          draft={draft}
          snapshot={snapshot}
          references={references}
          apply={generator.apply}
          onAdd={generator.addExtra}
          onOpen={(key, opener) => setPicker({ key, opener })}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-neutral-500">primary</span>
          <div className="flex rounded-lg bg-neutral-200/70 p-0.5" role="group" aria-label="primary-Strategie">
            {primaryOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.hint}
                aria-pressed={draft.primary === option.value}
                onClick={() => generator.apply((current) => ({ ...current, primary: option.value }))}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  draft.primary === option.value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-2 text-neutral-600">
          <span className="size-4 rounded ring-1 ring-black/10" style={{ background: snapshot.roles.primary.hex }} />
          <span className="uppercase tabular-nums">{snapshot.roles.primary.hex.slice(1)}</span>
          <span className="text-neutral-400">·</span>
          {onPrimary.derivation} darauf {onPrimary.contrast && formatRatio(onPrimary.contrast.ratio)}
        </p>
        {snapshot.warnings.map((warning) => (
          <p key={warning.message} className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-amber-900">
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
            {warning.message}
          </p>
        ))}
      </div>

      {children}

      <section className="mt-12 border-t border-neutral-200 pt-8" aria-label="Vorschau">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Vorschau</h2>
          <div className="flex rounded-lg bg-neutral-200/70 p-0.5 text-sm" role="group" aria-label="Darstellung der Vorschau">
            {previewModes.map((mode) => (
              <button
                key={mode.label}
                type="button"
                aria-pressed={previewDark === mode.dark}
                onClick={() => setPreviewDark(mode.dark)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
                  previewDark === mode.dark ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                <mode.icon aria-hidden className="size-3.5" strokeWidth={2} />
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <SchemePreview
          snapshot={snapshot}
          extras={draft.sources.extras.map((extra) => extra.name)}
          fonts={fonts}
          aside={previewAside}
          dark={previewDark}
        />
      </section>

      {picker && (
        <ColorPicker
          key={String(picker.key)}
          draft={draft}
          sourceKey={picker.key}
          opener={picker.opener}
          pool={poolData}
          apply={generator.apply}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-sans text-[11px] text-neutral-600">{children}</kbd>;
}
