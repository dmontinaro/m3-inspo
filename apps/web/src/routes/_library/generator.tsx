import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { parseGeneratorSearch, randomSeed, serializeGeneratorSearch } from "@m3-inspo/shared/color-scheme";
import { SaveDialog } from "#/components/brand-kits/save-dialog";
import { GeneratorActions, GeneratorWorkspace, useGeneratorPage } from "#/components/generator/generator-workspace";
import { draftFromSearch, linkedSlugs, poolSearch, searchFromDraft } from "#/lib/generator";
import { getGeneratorPool } from "#/server/generator.functions";

/**
 * The generator (spec #44): roll a Color Scheme from the pool. Its whole
 * state is in the URL (`[name:]hex[~hue|~exact][@slug]` per colour, plus
 * `primary`, `seed`, `pool`); steps replace it once they settle, so
 * reloading restores the state and rolling adds no history entries. Undo
 * lives in memory. "Speichern" turns it into a Brand Kit.
 */
export const Route = createFileRoute("/_library/generator")({
  head: () => ({ meta: [{ title: "Generator · m3 inspo" }] }),
  // The shared parser reads and checks the params (parseGeneratorSearch); the router only hands them over.
  validateSearch: (search: Record<string, unknown>) => search,
  // A link without a seed gets one, so the colours it leaves open roll the same on server and client.
  beforeLoad: ({ search }) => {
    if (search.seed === undefined) throw redirect({ to: "/generator", search: { ...search, seed: randomSeed() }, replace: true });
  },
  // The pool loads once per pool; the generator's own URL steps never refetch it.
  loaderDeps: ({ search }) => ({ pool: search.pool }),
  staleTime: Infinity,
  loader: ({ location }) => {
    const { state } = parseGeneratorSearch(location.search);
    return getGeneratorPool({ data: { pool: state.pool, linked: linkedSlugs(state) } });
  },
  component: GeneratorPage,
});

function GeneratorPage() {
  const search = Route.useSearch();
  const poolData = Route.useLoaderData();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const saveButton = useRef<HTMLButtonElement>(null);
  const page = useGeneratorPage({
    path: "/generator",
    poolData,
    read: () => draftFromSearch(search, poolData),
    search: (draft, pool, references) => serializeGeneratorSearch(searchFromDraft(draft, pool, references)),
    paused: saving,
  });

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-24 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <Link to="/brand-kits" className="text-sm text-neutral-500 hover:text-neutral-900">
            Brand Kits
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Neues Color Scheme</h1>
        </div>
        <GeneratorActions page={page}>
          <button
            ref={saveButton}
            type="button"
            onClick={() => setSaving(true)}
            className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
          >
            <Bookmark aria-hidden className="size-4" strokeWidth={2} />
            Speichern
          </button>
        </GeneratorActions>
      </div>

      <GeneratorWorkspace page={page} poolData={poolData} />

      {saving && (
        <SaveDialog
          draft={page.draft}
          project={page.pool.kind === "project" ? page.pool.tag : ""}
          projects={poolData.projects}
          onCancel={() => {
            setSaving(false);
            saveButton.current?.focus();
          }}
          // The kit's page rolls on from the same pool.
          onSaved={(slug) => {
            const poolPart = poolSearch(page.pool);
            return navigate({ href: `/brand-kits/${slug}${poolPart && `?${poolPart}`}` });
          }}
        />
      )}
    </main>
  );
}
