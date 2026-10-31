import { formatDate, formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Palette } from "lucide-react";
import type { CurationStatus } from "@m3-inspo/db/library-schema";
import { poolValue } from "@m3-inspo/shared/color-scheme";
import { WEBGL_TECH } from "@m3-inspo/shared";
import type { TokenSource } from "@m3-inspo/shared";
import { AddToCollection } from "#/components/add-to-collection";
import { AiAnalysis } from "#/components/ai-analysis";
import { CaptureFigure } from "#/components/capture-figure";
import { FavoriteStar } from "#/components/favorite-star";
import { InlineField } from "#/components/inline-field";
import { ReferenceEditForm } from "#/components/reference-edit-form";
import { TagInput } from "#/components/tag-input";
import {
  curationStatuses,
  deviceLabels,
  devices,
  focusAreas,
  focusLabels,
  maxAttributionLength,
  maxSourceUrlLength,
  statusLabels,
} from "#/lib/curation";
import { inputClassName } from "#/lib/form-styles";
import { paletteSearch } from "#/lib/generator";
import { maxNoteLength } from "#/lib/upload-limits";
import { getCollections } from "#/server/collections.functions";
import { deleteReference, getReference, setReferenceFavorite, setReferenceStatus } from "#/server/library.functions";

export const Route = createFileRoute("/_library/references/$slug")({
  loader: async ({ params }) => {
    const [reference, collections] = await Promise.all([getReference({ data: { slug: params.slug } }), getCollections()]);
    return { reference, collections };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.reference.title} · m3 inspo` : "m3 inspo" }] }),
  component: ReferenceDetail,
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-xl font-semibold">{m.reference_not_found()}</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4">
        {m.gallery_back()}</Link>
    </main>
  ),
});

type Reference = Awaited<ReturnType<typeof getReference>>;
type CollectionOption = { slug: string; name: string };
/** Where a design value comes from (docs/spec.md, Herkunft). */
const sourceLabels: Record<TokenSource, string> = {
  get dom() { return m.measurement_dom(); },
  get image() { return m.measurement_image(); },
  get vision() { return m.measurement_vision(); },
  get manual() { return m.measurement_manual(); },
};


// One reference: the captures with their marked regions on the left, title, curation and
// the owner's notes beside it, below them the most similar references.
// On small screens the sidebar comes first, so a tall full-page capture does not bury it.
// Notes, focus, format, tags, source and attribution are editable in place, one at a time;
// "Bearbeiten" turns the whole sidebar into a form. Status and favorite apply right away.
function ReferenceDetail() {
  const { reference, collections } = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-16 sm:px-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> {m.gallery_title()}</Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <aside className="lg:order-2">
          <div className="lg:sticky lg:top-6">
            {editing ? (
              <>
                <h1 className="sr-only">{m.edit_named({ name: reference.title })}</h1>
                <ReferenceEditForm
                  reference={reference}
                  onCancel={() => setEditing(false)}
                  onSaved={async () => {
                    await router.invalidate();
                    setEditing(false);
                  }}
                />
              </>
            ) : (
              <ReferenceSidebar reference={reference} collections={collections} onEdit={() => setEditing(true)} />
            )}
          </div>
        </aside>

        <div className="space-y-8 lg:order-1">
          {reference.sourceUrl && reference.analysis?.tech.includes(WEBGL_TECH) && (
            <LiveOnlyNotice sourceUrl={reference.sourceUrl} />
          )}
          {reference.captures.map((capture) => (
            <CaptureFigure
              key={capture.id}
              capture={capture}
              title={reference.title}
              slug={reference.slug}
              phoneSized={reference.device === "mobile"}
            />
          ))}
        </div>
      </div>

      {reference.similar.length > 0 && <SimilarReferences references={reference.similar} />}
    </main>
  );
}

/**
 * Above the captures of a page drawn with WebGL: the worker captures with 3D
 * off, so the images may show a loading state. Agents get the same hint (`viewLive`).
 */
function LiveOnlyNotice({ sourceUrl }: { sourceUrl: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700 ring-1 ring-black/5">
      <span>
        <span className="font-medium text-neutral-900">{m.reference_webgl_title()}</span> {m.reference_webgl_help()}</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900"
      >
        {m.reference_view_source()}</a>
    </p>
  );
}

/**
 * "Ähnliche Referenzen": the references closest in meaning (title, notes, tags
 * and AI description), as small gallery tiles in a row. Left out while there
 * are none, e.g. without embeddings.
 */
function SimilarReferences({ references }: { references: Reference["similar"] }) {
  return (
    <section aria-labelledby="similar-references" className="mt-14 border-t border-neutral-200 pt-8">
      <h2 id="similar-references" className="text-sm font-semibold text-neutral-900">
        {m.references_similar()}</h2>
      <p className="mt-1 text-xs text-neutral-500">{m.references_similar_help()}</p>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4 lg:gap-x-6">
        {references.map((similar) => (
          <li key={similar.slug}>
            <Link to="/references/$slug" params={{ slug: similar.slug }} className="group block">
              <div className="overflow-hidden rounded-lg bg-neutral-200 ring-1 ring-black/5 transition-shadow group-hover:shadow-lg group-hover:shadow-black/10">
                <img
                  src={similar.thumbUrl}
                  alt=""
                  width={960}
                  height={600}
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover object-top"
                />
              </div>
              <p className="mt-2 truncate text-sm font-medium text-neutral-800 group-hover:text-neutral-950">{similar.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "aus der Seite gelesen" when all values share their source, else every
 * source that occurs. Estimates add the model's average confidence.
 */
function provenanceOf(values: { source: TokenSource; confidence?: number }[]) {
  const sources = [...new Set(values.map((value) => sourceLabels[value.source]))].join(", ");
  const confidences = values.flatMap((value) => (value.confidence === undefined ? [] : [value.confidence]));
  if (confidences.length === 0) return sources;
  const average = confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;
  return m.source_confidence({ sources, confidence: formatNumber(Math.round(average * 100)) });
}

/** A font as shown: a family name as read, a style estimate ("roman-serif") in words. */
const fontLabel = (font: { value: string; source: TokenSource }) =>
  font.source === "vision" ? font.value.replaceAll("-", " ") : font.value;

const modeLabels = { get light() { return m.mode_light(); }, get dark() { return m.mode_dark(); } } as const;

/**
 * The design values of the current analysis, compact, each group with where it comes from.
 * "Als Brand Kit übernehmen" opens the generator with the palette as exact source colours,
 * to adjust and save there; only approved references, which the generator knows, offer it.
 */
function DesignValues({ analysis, slug, approved }: { analysis: NonNullable<Reference["analysis"]>; slug: string; approved: boolean }) {
  const { palette, fonts, tech, mode } = analysis;
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900">{m.reference_design_values()}</h2>
      {palette.length > 0 && (
        <div className="mt-2.5">
          <ul className="flex flex-wrap gap-1.5" aria-label={m.palette_title()}>
            {palette.map(({ value }) => (
              <li key={value} className="flex flex-col items-center gap-1">
                <span aria-hidden className="size-8 rounded-md ring-1 ring-black/10 ring-inset" style={{ backgroundColor: value }} />
                <span className="font-mono text-[10px] text-neutral-500">{value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-neutral-500">{m.palette_provenance({ source: provenanceOf(palette) })}</p>
          {approved && (
            <Link
              to="/generator"
              search={paletteSearch(
                palette.map(({ value }) => value),
                slug,
              )}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-neutral-600 ring-1 ring-neutral-300 ring-inset hover:bg-neutral-100 hover:text-neutral-900"
            >
              <Palette aria-hidden className="size-3.5" strokeWidth={1.75} />
              {m.reference_take_as_kit()}</Link>
          )}
        </div>
      )}
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-sm">
        {fonts.length > 0 && (
          <>
            <dt className="text-neutral-500">{m.reference_fonts()}</dt>
            <dd className="text-neutral-800">
              {fonts.map(fontLabel).join(", ")}
              <span className="block text-xs text-neutral-500">{provenanceOf(fonts)}</span>
            </dd>
          </>
        )}
        {mode && (
          <>
            <dt className="text-neutral-500">{m.reference_mode()}</dt>
            <dd className="text-neutral-800">{modeLabels[mode]}</dd>
          </>
        )}
        {tech.length > 0 && (
          <>
            <dt className="text-neutral-500">{m.reference_technology()}</dt>
            <dd className="text-neutral-800">{tech.join(", ")}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function ReferenceSidebar({
  reference,
  collections,
  onEdit,
}: {
  reference: Reference;
  /** Every collection, for the "Zu Sammlung hinzufügen" menu. */
  collections: CollectionOption[];
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Runs one immediate change (status, favorite, delete), then `done`, e.g. reloading the reference. */
  async function change(action: () => Promise<unknown>, done = () => router.invalidate()) {
    setPending(true);
    setFailed(false);
    try {
      await action();
      await done();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  function remove() {
    const question = m.reference_delete_confirm({ title: reference.title });
    if (!window.confirm(question)) return;
    return change(
      () => deleteReference({ data: { slug: reference.slug } }),
      () => router.navigate({ to: "/" }),
    );
  }

  const focus = focusAreas.find((area) => area === reference.focus);
  const reload = () => router.invalidate();

  return (
    <>
      <div className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight text-balance">{reference.title}</h1>
        <button
          type="button"
          disabled={pending}
          aria-pressed={reference.isFavorite}
          aria-label={m.favorite_label()}
          title={reference.isFavorite ? m.favorite_remove() : m.favorite_add()}
          onClick={() =>
            change(() => setReferenceFavorite({ data: { slug: reference.slug, isFavorite: !reference.isFavorite } }))
          }
          className="-mt-0.5 -mr-1.5 shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 aria-pressed:text-amber-500"
        >
          <FavoriteStar filled={reference.isFavorite} className="size-6" />
        </button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{m.reference_added_date({ date: formatDate(reference.createdAt) })}</p>

      <StatusSwitch
        status={reference.curationStatus}
        disabled={pending}
        onChange={(status) => change(() => setReferenceStatus({ data: { slug: reference.slug, status } }))}
      />

      <div className="mt-8 space-y-6">
        <Note
          slug={reference.slug}
          name="takeNote"
          label={m.reference_take()}
          text={reference.takeNote}
          placeholder={m.reference_take_placeholder()}
          dotClassName="bg-emerald-500"
          onSaved={reload}
        />
        <Note
          slug={reference.slug}
          name="avoidNote"
          label={m.reference_avoid()}
          text={reference.avoidNote}
          placeholder={m.reference_avoid_placeholder()}
          dotClassName="bg-rose-500"
          onSaved={reload}
        />
        {reference.analysis && (
          <DesignValues analysis={reference.analysis} slug={reference.slug} approved={reference.curationStatus === "approved"} />
        )}
        <AiAnalysis reference={reference} />
      </div>

      <dl className="mt-8 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-2 text-sm">
        <dt className="text-neutral-500">{m.reference_focus()}</dt>
        <dd className="text-neutral-800">
          <InlineField
            slug={reference.slug}
            name="focus"
            editLabel={m.reference_edit_focus()}
            value={focus ? focusLabels[focus] : null}
            onSaved={reload}
            control={({ id, errorId }) => (
              <select
                id={id}
                name="focus"
                autoFocus
                defaultValue={reference.focus ?? ""}
                aria-label={m.reference_focus()}
                aria-describedby={errorId}
                className={inputClassName}
              >
                <option value="">{m.field_not_set()}</option>
                {focusAreas.map((area) => (
                  <option key={area} value={area}>
                    {focusLabels[area]}
                  </option>
                ))}
              </select>
            )}
          />
        </dd>
        <dt className="text-neutral-500">{m.field_format()}</dt>
        <dd className="text-neutral-800">
          <InlineField
            slug={reference.slug}
            name="device"
            editLabel={m.reference_edit_format()}
            value={deviceLabels[reference.device]}
            onSaved={reload}
            control={({ id, errorId }) => (
              <select
                id={id}
                name="device"
                autoFocus
                defaultValue={reference.device}
                aria-label={m.field_format()}
                aria-describedby={errorId}
                className={inputClassName}
              >
                {devices.map((device) => (
                  <option key={device} value={device}>
                    {deviceLabels[device]}
                  </option>
                ))}
              </select>
            )}
          />
        </dd>
        <dt className="text-neutral-500">{m.field_tags()}</dt>
        <dd>
          <InlineField
            slug={reference.slug}
            name="tags"
            editLabel={m.reference_edit_tags()}
            value={
              reference.tags.length > 0 ? (
                // Each tag opens the gallery filtered by it.
                <ul className="-my-0.5 flex flex-wrap gap-1.5">
                  {reference.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        to="/"
                        search={{ tag }}
                        className="block rounded-full bg-neutral-100 px-2.5 py-0.5 text-neutral-800 ring-1 ring-neutral-200 ring-inset hover:bg-neutral-200"
                      >
                        {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null
            }
            onSaved={reload}
            control={({ id, errorId }) => <TagInput id={id} defaultTags={reference.tags} errorId={errorId} autoFocus />}
          />
        </dd>
        <dt className="text-neutral-500">{m.field_source()}</dt>
        <dd className="text-neutral-800">
          <InlineField
            slug={reference.slug}
            name="sourceUrl"
            editLabel={m.reference_edit_source()}
            value={
              reference.sourceUrl ? (
                <a
                  href={reference.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900"
                >
                  {reference.siteHost ?? reference.sourceUrl}
                </a>
              ) : null
            }
            onSaved={reload}
            control={({ id, errorId }) => (
              <input
                id={id}
                name="sourceUrl"
                type="url"
                inputMode="url"
                autoFocus
                maxLength={maxSourceUrlLength}
                defaultValue={reference.sourceUrl ?? ""}
                placeholder="https://"
                aria-label={m.field_source()}
                aria-invalid={errorId ? true : undefined}
                aria-describedby={errorId}
                className={inputClassName}
              />
            )}
          />
        </dd>
        <dt className="text-neutral-500">{m.reference_attribution()}</dt>
        <dd className="text-neutral-800">
          <InlineField
            slug={reference.slug}
            name="attribution"
            editLabel={m.reference_edit_attribution()}
            value={reference.attribution}
            onSaved={reload}
            control={({ id, errorId }) => (
              <input
                id={id}
                name="attribution"
                autoFocus
                maxLength={maxAttributionLength}
                defaultValue={reference.attribution ?? ""}
                placeholder={m.attribution_placeholder()}
                aria-label={m.reference_attribution()}
                aria-invalid={errorId ? true : undefined}
                aria-describedby={errorId}
                className={inputClassName}
              />
            )}
          />
        </dd>
      </dl>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">{m.collections_title()}</h2>
        {/* Each collection opens its page; the last entry adds the reference to more. */}
        <ul className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          {reference.collections.map((collection) => (
            <li key={collection.slug}>
              <Link
                to="/collections/$slug"
                params={{ slug: collection.slug }}
                className="block rounded-full bg-neutral-100 px-2.5 py-0.5 text-neutral-800 ring-1 ring-neutral-200 ring-inset hover:bg-neutral-200"
              >
                {collection.name}
              </Link>
            </li>
          ))}
          <li>
            <AddToCollection
              referenceSlug={reference.slug}
              memberOf={reference.collections}
              collections={collections}
              onChanged={() => router.invalidate()}
            />
          </li>
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-5">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
        >
          {m.action_edit()}</button>
        {/* The generator with only this reference as its pool; without a palette it rolls freely.
            Only approved references enter a pool, so drafts and archived ones get no link. */}
        {reference.curationStatus === "approved" && (
          <Link
            to="/generator"
            search={{ pool: poolValue({ kind: "references", slugs: [reference.slug] }) }}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
          >
            <Palette aria-hidden className="size-4" strokeWidth={1.75} />
            {m.scheme_from_reference()}</Link>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="ml-auto rounded-md px-2.5 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          {m.action_delete_permanently()}</button>
      </div>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {m.action_failed()}</p>
      )}
    </>
  );
}

const statusHints: Record<CurationStatus, string> = {
  get draft() { return m.kit_draft_help(); },
  get approved() { return m.reference_approved_help(); },
  get archived() { return m.reference_archived_help(); },
};

const statusDots: Record<CurationStatus, string> = {
  draft: "bg-amber-400",
  approved: "bg-emerald-500",
  archived: "bg-neutral-400",
};

/** The three curation statuses as one segmented control, with what the current one means for agents. */
function StatusSwitch({
  status,
  disabled,
  onChange,
}: {
  status: CurationStatus;
  disabled: boolean;
  onChange: (status: CurationStatus) => void;
}) {
  return (
    <div className="mt-6">
      <div role="group" aria-label={m.field_status()} className="grid grid-cols-3 rounded-lg bg-neutral-200/70 p-1">
        {curationStatuses.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={option === status}
            onClick={() => option !== status && onChange(option)}
            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 disabled:cursor-default aria-pressed:bg-white aria-pressed:font-medium aria-pressed:text-neutral-900 aria-pressed:shadow-sm"
          >
            <span aria-hidden className={`size-1.5 rounded-full ${statusDots[option]}`} />
            {statusLabels[option]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">{statusHints[status]}</p>
    </div>
  );
}

/** One of the two notes, editable in place like the fields below it. */
function Note({
  slug,
  name,
  label,
  text,
  placeholder,
  dotClassName,
  onSaved,
}: {
  slug: string;
  name: "takeNote" | "avoidNote";
  label: string;
  text: string | null;
  placeholder: string;
  dotClassName: string;
  onSaved: () => Promise<unknown>;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span aria-hidden className={`size-2 rounded-full ${dotClassName}`} />
        {label}
      </h2>
      <div className="mt-1.5 text-[15px]">
        <InlineField
          slug={slug}
          name={name}
          editLabel={m.edit_named({ name: label })}
          value={text ? <p className="leading-relaxed whitespace-pre-line text-neutral-700">{text}</p> : null}
          emptyText={m.note_none()}
          onSaved={onSaved}
          control={({ id, errorId }) => (
            <textarea
              id={id}
              name={name}
              autoFocus
              maxLength={maxNoteLength}
              defaultValue={text ?? ""}
              placeholder={placeholder}
              aria-label={label}
              aria-invalid={errorId ? true : undefined}
              aria-describedby={errorId}
              className={`${inputClassName} field-sizing-content min-h-24 leading-relaxed`}
            />
          )}
        />
      </div>
    </section>
  );
}
