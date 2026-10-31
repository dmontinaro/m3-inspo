import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { KitStatus } from "#/components/brand-kits/parts";
import { StandInBadge, useFontFaces } from "#/components/font-faces";
import { FontPreviewFigure } from "#/components/font-preview";
import { PairingNotFound } from "#/components/pairing-not-found";
import { FamilyName, PairingPosterHead, roleEntries } from "#/components/pairing-poster";
import { useDismiss } from "#/components/use-dismiss";
import { fontCategoryLabels, fontRoleLabels, fontSourceLabels, regularWeight, sampleTexts } from "#/lib/fonts";
import type { FontRole, RoleFont } from "#/lib/fonts";
import { getBrandKits } from "#/server/brand-kits.functions";
import { getTypePairing } from "#/server/type-pairings.functions";
import type { FontPreview } from "#/server/font-previews.server";

export const Route = createFileRoute("/_library/schriften/$slug/")({
  loader: ({ params }) => getTypePairing({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.name} · m3 inspo` : "m3 inspo" }] }),
  component: PairingDetail,
  notFoundComponent: PairingNotFound,
});

type Pairing = Awaited<ReturnType<typeof getTypePairing>>;

/** How often the page reloads while a font preview is being captured. */
const refreshMs = 3_000;

// A pairing as a poster: the name large in the heading font, the note in the body font and
// where it came from; below, one section per font role with its glyphs (or its font preview)
// and every weight. While a font preview is being captured, the page refreshes itself.
function PairingDetail() {
  const pairing = Route.useLoaderData();
  const router = useRouter();
  const capturing = Object.values(pairing.previews).some((preview) => preview?.status === "capturing");

  useEffect(() => {
    if (!capturing) return;
    const timer = setInterval(() => void router.invalidate(), refreshMs);
    return () => clearInterval(timer);
  }, [capturing, router]);

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-24 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/schriften" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
          <span aria-hidden>←</span> Schriften
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/schriften/$slug/bearbeiten"
            params={{ slug: pairing.slug }}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
          >
            <Pencil aria-hidden className="size-4" />
            Bearbeiten
          </Link>
          <TakeOverMenu pairingSlug={pairing.slug} />
        </div>
      </div>

      <div className="mt-8 border-b border-neutral-300 pb-10">
        <PairingPosterHead name={pairing.name} text={pairing.note ?? sampleTexts.body} roles={pairing.roles}>
          <p className="mt-4 text-sm text-neutral-500">
            <Origin origin={pairing.origin} />
          </p>
        </PairingPosterHead>
      </div>

      {roleEntries(pairing.roles).map(({ role, font }) => (
        <RoleSection key={role} role={role} font={font} preview={font.pageUrl ? pairing.previews[font.pageUrl] : undefined} />
      ))}
    </main>
  );
}

/**
 * "In Brand Kit übernehmen": a menu of the kits that are not archived,
 * loaded when it opens. A kit opens its page with this pairing's fonts
 * taken over, unsaved, so the kit changes only with its "Speichern".
 */
function TakeOverMenu({ pairingSlug }: { pairingSlug: string }) {
  const [open, setOpen] = useState(false);
  const container = useDismiss(open, setOpen);
  const [kits, setKits] = useState<Awaited<ReturnType<typeof getBrandKits>>>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || kits) return;
    getBrandKits().then(setKits, () => setFailed(true));
  }, [open, kits]);

  const offered = kits?.filter((kit) => kit.status !== "archived");

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        In Brand Kit übernehmen
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg shadow-black/10">
          <p className="px-2.5 pt-1.5 pb-2 text-xs font-medium tracking-wide text-neutral-400 uppercase">Brand Kits</p>
          {failed ? (
            <p className="px-2.5 pb-2 text-sm text-rose-700">Das hat nicht geklappt. Bitte versuche es noch einmal.</p>
          ) : !offered ? (
            <p className="px-2.5 pb-2 text-sm text-neutral-500">Lädt …</p>
          ) : offered.length === 0 ? (
            <p className="px-2.5 pb-2 text-sm text-neutral-500">Noch keine Brand Kits. Du legst sie im Generator an.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {offered.map((kit) => (
                <li key={kit.slug}>
                  <Link
                    to="/brand-kits/$slug"
                    params={{ slug: kit.slug }}
                    search={{ pairing: pairingSlug }}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
                  >
                    <span aria-hidden className="flex shrink-0 -space-x-1.5">
                      {[kit.colors.brand, kit.colors.neutral].map((hex) => (
                        <span key={hex} className="size-4 rounded-full ring-2 ring-white" style={{ background: hex }} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{kit.name}</span>
                    <KitStatus status={kit.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Origin({ origin }: { origin: Pairing["origin"] }) {
  if (origin.kind === "manual") return "Von Hand angelegt";
  if (origin.kind === "brand_kit") {
    if (!origin.brandKit) return "Aus der Typografie eines Brand Kits, das inzwischen gelöscht ist";
    return (
      <>
        Aus der Typografie des Brand Kits „
        <Link to="/brand-kits/$slug" params={{ slug: origin.brandKit.slug }} className="underline underline-offset-2 hover:text-neutral-900">
          {origin.brandKit.name}
        </Link>
        “
      </>
    );
  }
  if (!origin.reference) return "Aus einer Referenz, die inzwischen gelöscht ist";
  return (
    <>
      Aus der Referenz „
      <Link to="/referenzen/$slug" params={{ slug: origin.reference.slug }} className="underline underline-offset-2 hover:text-neutral-900">
        {origin.reference.title}
      </Link>
      “
    </>
  );
}

/**
 * One font role: family, category, source, its glyphs, a line per weight
 * and, for `body`, a paragraph in three sizes. A family with a page link
 * shows its font preview instead of the glyphs.
 */
function RoleSection({ role, font, preview }: { role: FontRole; font: RoleFont; preview?: FontPreview }) {
  const { fontStyle } = useFontFaces([font]);

  return (
    <section className="grid gap-6 border-b border-neutral-200 py-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="text-sm">
        <h2 className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{fontRoleLabels[role]}</h2>
        <p className="mt-1 text-lg font-medium text-neutral-900">
          <FamilyName font={font} />
        </p>
        <p className="text-neutral-500">
          {fontCategoryLabels[font.category]} · {fontSourceLabels[font.source]}
        </p>
        <div className="mt-2">
          <StandInBadge font={font} />
        </div>
      </div>
      <div className="min-w-0 space-y-8">
        {font.pageUrl ? (
          <FontPreviewFigure family={font.family} pageUrl={font.pageUrl} preview={preview} />
        ) : (
          <p className="text-3xl leading-snug break-words text-neutral-900" style={fontStyle(font, regularWeight(font))}>
            {sampleTexts.glyphs}
          </p>
        )}
        <ul className="space-y-1">
          {font.weights.map((weight) => (
            <li key={weight} className="flex items-baseline gap-4">
              <span className="w-10 shrink-0 text-xs text-neutral-400 tabular-nums">{weight}</span>
              <span className="truncate text-3xl text-neutral-950 sm:text-4xl" style={fontStyle(font, weight)}>
                {role === "mono" ? sampleTexts.mono : sampleTexts.heading}
              </span>
            </li>
          ))}
        </ul>
        {role === "body" && (
          <div className="grid gap-6 md:grid-cols-3">
            {[14, 16, 18].map((px) => (
              <div key={px}>
                <p className="mb-1 text-xs text-neutral-400">{px} px</p>
                <p className="leading-relaxed text-neutral-700" style={{ ...fontStyle(font, regularWeight(font)), fontSize: px }}>
                  {sampleTexts.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
