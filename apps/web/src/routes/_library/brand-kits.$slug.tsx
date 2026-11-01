import { useLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { parseGeneratorSearch, serializeGeneratorSearch } from "@m3-inspo/shared/color-scheme";
import { KitDesignBriefing } from "#/components/brand-kits/kit-design-briefing";
import { CssExport, KitNotes, SourceReferences } from "#/components/brand-kits/kit-details";
import { KitManageActions, KitStatusControl } from "#/components/brand-kits/kit-lifecycle";
import { KitTypography, sameTypography, takeOver } from "#/components/brand-kits/kit-typography";
import type { TypographyState } from "#/components/brand-kits/kit-typography";
import { GeneratorActions, GeneratorWorkspace, useGeneratorPage } from "#/components/generator/generator-workspace";
import {
  draftFromScheme,
  draftFromSearch,
  hasSchemeParams,
  isSameScheme,
  linkedSlugs,
  poolSearch,
  searchFromDraft,
} from "#/lib/generator";
import type { PoolData } from "#/lib/generator";
import { getBrandKit, saveBrandKitChanges } from "#/server/brand-kits.functions";
import { getGeneratorPool } from "#/server/generator.functions";
import { getTypePairing } from "#/server/type-pairings.functions";

type Kit = Awaited<ReturnType<typeof getBrandKit>>;

/**
 * A Brand Kit's page (spec #44, "Speichern und Kit-Seite"): the saved Color
 * Scheme in the generator. Without colour parameters it shows the saved
 * state; changes write the generator's parameters, and while they differ
 * from the saved state a bar offers "Speichern" (overwrites) and
 * "Verwerfen". No autosave. Below the controls: notes, source references
 * and the CSS export of the saved snapshot. The preview shows the kit's
 * fonts, set above its building blocks (#68); a font change is unsaved
 * like a colour change, but lives only in the page, not in its URL.
 * `?pairing=<slug>` ("In Brand Kit übernehmen" on a pairing) opens the page
 * with that pairing taken over, unsaved; the page drops the parameter from
 * its URL. The status switch sits under the title; duplicating and
 * deleting at the end of the page. The design briefing opens in a side panel
 * from the header; it is saved separately and exported as DESIGN.md;
 * optional session drafts are only starting points.
 */
export const Route = createFileRoute("/_library/brand-kits/$slug")({
  validateSearch: (search: Record<string, unknown>) => search,
  // Another kit is another page: its generator starts over instead of keeping the last kit's draft.
  remountDeps: ({ params }) => params.slug,
  // Like /generator: the pool loads once per pool; the page's own URL steps never refetch it.
  loaderDeps: ({ search }) => ({ pool: search.pool, pairing: search.pairing }),
  staleTime: Infinity,
  loader: async ({ params, location }) => {
    const { state } = parseGeneratorSearch(location.search);
    const pairingSlug = "pairing" in location.search ? location.search.pairing : undefined;
    const [kit, poolData, pairing] = await Promise.all([
      getBrandKit({ data: { slug: params.slug } }),
      getGeneratorPool({ data: { pool: state.pool, linked: linkedSlugs(state) } }),
      // An unknown pairing takes nothing over.
      typeof pairingSlug === "string" ? getTypePairing({ data: { slug: pairingSlug } }).catch(() => null) : null,
    ]);
    const takenOver = pairing && { id: pairing.id, slug: pairing.slug, name: pairing.name, roles: pairing.roles, archived: pairing.archived };
    return { kit, poolData: withSourceReferences(poolData, kit.sourceReferences), takenOver };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.kit.name} · Brand Kits · m3 inspo` : "m3 inspo" }] }),
  component: BrandKitPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-xl font-semibold">{m.kit_not_found()}</h1>
      <Link to="/brand-kits" className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4">
        {m.kits_back()}</Link>
    </main>
  ),
});

/**
 * The kit's source references count as linked: the generator names their
 * colours' origins and keeps their `@slug` in its URL, archived ones and
 * ones without a capture too, which the pool (approved references only)
 * leaves out.
 */
function withSourceReferences(data: PoolData, sourceReferences: Kit["sourceReferences"]): PoolData {
  const known = new Set(data.linked.references.map((reference) => reference.id));
  const added = sourceReferences.flatMap(({ id, slug, title, thumbUrl }) => (known.has(id) ? [] : [{ id, slug, title, thumbUrl }]));
  return { ...data, linked: { ...data.linked, references: [...data.linked.references, ...added] } };
}

function BrandKitPage() {
  const { kit, poolData, takenOver } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const saved = draftFromScheme(kit.colorScheme);
  const page = useGeneratorPage({
    path: `/brand-kits/${kit.slug}`,
    poolData,
    // Without colour parameters the saved state, rolling on from the URL's pool.
    read: () => {
      const start = draftFromSearch(search, poolData);
      return hasSchemeParams(search) ? start : { ...start, draft: saved };
    },
    // The saved state needs no colour parameters; the pool stays in the URL either way.
    search: (draft, pool, references) =>
      isSameScheme(draft, saved) ? poolSearch(pool) : serializeGeneratorSearch(searchFromDraft(draft, pool, references)),
  });
  const colorsChanged = !isSameScheme(page.draft, saved);

  // The typography as changed on this page; undefined while it is the saved one.
  const savedTypography: TypographyState = { typography: kit.typography, origin: kit.typographyOrigin };
  const [changedTypography, setChangedTypography] = useState(() => (takenOver ? takeOver(takenOver) : undefined));
  const typography = changedTypography ?? savedTypography;
  const typographyChanged = !sameTypography(typography.typography, kit.typography);
  const unsaved = colorsChanged || typographyChanged;
  const current = useRef({ draft: page.draft, typography });
  current.current = { draft: page.draft, typography };
  useLanguageGuard({ dirty: typographyChanged });

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <Link to="/brand-kits" className="text-sm text-neutral-500 hover:text-neutral-900">
            {m.brand_kits_title()}</Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{kit.name}</h1>
          <KitStatusControl kit={kit} />
        </div>
        <GeneratorActions page={page}>
          <KitDesignBriefing
            slug={kit.slug}
            name={kit.name}
            briefing={kit.designBriefing}
            approved={kit.status === "approved"}
            onSaved={() => router.invalidate()}
          />
        </GeneratorActions>
      </div>

      <GeneratorWorkspace
        page={page}
        poolData={poolData}
        fonts={typography.typography?.roles ?? null}
        previewAside={
          <KitTypography
            kitSlug={kit.slug}
            value={typography}
            unsaved={typographyChanged}
            onChange={setChangedTypography}
            onKept={() => router.invalidate()}
          />
        }
      >
        <div className="mt-12 grid grid-cols-1 gap-10 border-t border-neutral-200 pt-8 lg:grid-cols-2 lg:gap-16">
          <div className="flex min-w-0 flex-col gap-10">
            <KitNotes slug={kit.slug} notes={kit.notes} onSaved={() => router.invalidate()} />
            <SourceReferences references={kit.sourceReferences} sources={kit.colorScheme.sources} />
          </div>
          <CssExport css={kit.css} unsaved={colorsChanged} />
        </div>
      </GeneratorWorkspace>
      <KitManageActions kit={kit} />

      {(unsaved || kit.outdated) && (
        <SaveBar
          kit={kit}
          unsaved={unsaved}
          onSave={async () => {
            const submitted = { draft: page.draft, typography };
            const stored = await saveBrandKitChanges({
              data: { slug: kit.slug, scheme: { sources: page.draft.sources, primary: page.draft.primary }, typography: typography.typography },
            });
            const storedDraft = draftFromScheme(stored.colorScheme);
            // The server may have dropped a link to a reference deleted meanwhile; the draft follows what it stored.
            if (isSameScheme(current.current.draft, submitted.draft) && !isSameScheme(submitted.draft, storedDraft)) page.generator.apply(() => storedDraft);
            await router.invalidate();
            setChangedTypography((latest) => latest === submitted.typography ? undefined : latest);
          }}
          // A step of its own, so `Z` brings the discarded colour changes back; font changes simply go.
          onDiscard={() => {
            page.generator.apply(() => saved);
            page.setSkipped([]);
            setChangedTypography(undefined);
          }}
        />
      )}
    </main>
  );
}



/**
 * Floats at the bottom while the page differs from the saved kit: changes
 * not saved yet, or a generator that now computes other values from the
 * saved sources. "Speichern" overwrites the kit; "Verwerfen" goes back to
 * the saved state.
 */
function SaveBar({ kit, unsaved, onSave, onDiscard }: { kit: Kit; unsaved: boolean; onSave: () => Promise<void>; onDiscard: () => void }) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  const lines = [
    // Also when saving only takes over the generator's new values: agents see those too.
    ...(kit.status === "approved" ? [m.kit_approved_changes()] : []),
    ...(unsaved && kit.outdated ? [m.kit_snapshot_stale()] : []),
    ...(state === "failed" ? [m.save_failed()] : []),
  ];

  async function save() {
    setState("pending");
    try {
      await onSave();
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <div
      className="sticky bottom-4 z-30 mx-auto mt-10 flex max-w-3xl flex-col gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:gap-6 sm:pl-5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {!unsaved && <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" strokeWidth={2} />}
        <div role="status" className="min-w-0">
          <p className="font-medium">{unsaved ? m.unsaved_changes() : m.kit_snapshot_stale()}</p>
          {lines.map((line) => (
            <p key={line} className="text-neutral-300">
              {line}
            </p>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {unsaved && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={state === "pending"}
            className="rounded-md px-3.5 py-2 font-medium text-neutral-200 hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            {m.action_discard()}</button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={state === "pending"}
          className="rounded-md bg-white px-4 py-2 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-60"
        >
          {state === "pending" ? m.action_saving() : m.action_save()}
        </button>
      </div>
    </div>
  );
}
