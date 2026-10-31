import { pairingDetailPath } from "#/lib/page-paths";
import { useLanguageGuard, LanguageControl  } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
/**
 * A kit's typography on its page (#68), above the preview's building
 * blocks: the font roles with where they came from, "Anderes wählen" (a
 * type pairing or fonts set directly), "Als Pairing merken" and
 * "Entfernen". Choosing and removing change the page's unsaved state; the
 * page's "Speichern" stores them with the Color Scheme.
 */

import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { sameFamilies } from "@m3-inspo/shared/fonts";
import type { Typography } from "@m3-inspo/shared/fonts";
import { StandInBadge, useFontFaces } from "#/components/font-faces";
import { roleEntries } from "#/components/pairing-poster";
import { RoleFontPicker } from "#/components/role-font-picker";
import { fontRolesKey, fontRoleLabels, regularWeight } from "#/lib/fonts";
import type { FontRole, FontRoles, RoleFont } from "#/lib/fonts";
import { keepBrandKitTypography } from "#/server/brand-kits.functions";
import type { OriginPairing } from "#/server/brand-kits.server";
import { getCatalogFonts } from "#/server/font-catalog.functions";
import { getTypePairings } from "#/server/type-pairings.functions";

/** The typography as the page shows it (saved or changed), with its origin pairing as that pairing is now. */
export type TypographyState = { typography: Typography | null; origin: OriginPairing | null };

/** Whether two typographies hold the same values. Key order does not count: jsonb reorders keys. */
export function sameTypography(a: Typography | null, b: Typography | null) {
  const sorted = (value: unknown) =>
    JSON.stringify(value, (_, inner: unknown) =>
      inner && typeof inner === "object" && !Array.isArray(inner)
        ? Object.fromEntries(Object.entries(inner).sort(([x], [y]) => x.localeCompare(y)))
        : inner,
    );
  return sorted(a) === sorted(b);
}

/**
 * A copy of the pairing's roles with the pairing as origin. Once a kit has
 * a Typo-Skala (#69), a change of fonts keeps it.
 */
export function takeOver(pairing: OriginPairing): TypographyState {
  return {
    typography: { roles: pairing.roles, originPairingId: pairing.id, originPairingDeleted: false, scale: null },
    origin: pairing,
  };
}

const heaviest = (font: RoleFont) => Math.max(...font.weights);

const secondaryButton =
  "rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-white";

type KeepState = { status: "idle" | "pending" | "failed" } | { status: "duplicate"; pairing: { slug: string; name: string } };

/**
 * `unsaved` says the typography differs from the saved one: "Als Pairing
 * merken" keeps the saved typography, so it waits for "Speichern".
 * `onKept` reloads the page data once a pairing was kept.
 */
export function KitTypography({
  kitSlug,
  value,
  unsaved,
  onChange,
  onKept,
}: {
  kitSlug: string;
  value: TypographyState;
  unsaved: boolean;
  onChange: (next: TypographyState) => void;
  onKept: () => Promise<void>;
}) {
  const { typography, origin } = value;
  const [choosing, setChoosing] = useState(false);
  const [keep, setKeep] = useState<KeepState>({ status: "idle" });
  const opener = useRef<HTMLButtonElement>(null);
  const { fontStyle } = useFontFaces(typography ? roleEntries(typography.roles).map(({ font }) => font) : []);

  const matchesOrigin = Boolean(typography && origin && sameFamilies(typography.roles, origin.roles));
  const keepHint = unsaved
    ? m.typography_save_first()
    : matchesOrigin && origin
      ? m.pairing_matches_origin()
      : m.typography_keep_help();

  async function keepAsPairing() {
    setKeep({ status: "pending" });
    try {
      const result = await keepBrandKitTypography({ data: { slug: kitSlug } });
      if (result.status === "duplicate") return setKeep({ status: "duplicate", pairing: result.pairing });
      if (result.status === "saved") await onKept();
      setKeep({ status: result.status === "saved" ? "idle" : "failed" });
    } catch {
      setKeep({ status: "failed" });
    }
  }

  function change(next: TypographyState) {
    setKeep({ status: "idle" });
    onChange(next);
  }

  return (
    <section aria-labelledby="kit-fonts" className="rounded-xl bg-white p-4 font-sans text-sm text-neutral-900 ring-1 ring-black/5 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="kit-fonts" className="text-base font-semibold tracking-tight">
          {m.type_pairings_title()}</h3>
        {typography && (
          <button
            type="button"
            onClick={() => change({ typography: null, origin: null })}
            className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
          >
            {m.action_remove()}</button>
        )}
      </div>

      {typography ? (
        <>
          <ul className="mt-3 space-y-1.5">
            {roleEntries(typography.roles).map(({ role, font }) => (
              <li key={role} className="flex items-baseline justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2">
                <span className="shrink-0 text-neutral-500">{fontRoleLabels[role]}</span>
                <span className="min-w-0 text-right">
                  <span
                    className="block truncate text-[17px] text-neutral-950"
                    style={fontStyle(font, role === "heading" ? heaviest(font) : regularWeight(font))}
                  >
                    {font.family}
                  </span>
                  <span className="flex items-center justify-end gap-1.5 text-xs text-neutral-500 tabular-nums">
                    <StandInBadge font={font} />
                    {font.weights.join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            <OriginNote typography={typography} origin={origin} matchesOrigin={matchesOrigin} />
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button ref={opener} type="button" onClick={() => setChoosing(true)} className={secondaryButton}>
              {m.typography_choose_other()}</button>
            <button
              type="button"
              onClick={keepAsPairing}
              disabled={unsaved || matchesOrigin || keep.status === "pending"}
              title={keepHint}
              className={secondaryButton}
            >
              {keep.status === "pending" ? m.pairing_keeping() : m.pairing_keep_as()}
            </button>
          </div>
          {keep.status === "duplicate" && (
            <p role="status" className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              {m.pairing_already_kept()}{" "}
              <Link to={pairingDetailPath(keep.pairing.slug)} className="font-medium underline underline-offset-2">
                {keep.pairing.name}
              </Link>
            </p>
          )}
          {keep.status === "failed" && (
            <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-rose-800">
              {m.action_failed()}
            </p>
          )}
        </>
      ) : (
        <>
          <button
            ref={opener}
            type="button"
            onClick={() => setChoosing(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-300 px-3 py-5 text-neutral-700 hover:border-neutral-500 hover:text-neutral-950"
          >
            <Plus aria-hidden className="size-4" /> {m.typography_choose_pairing()}</button>
          <p className="mt-2 text-xs text-neutral-500">{m.typography_system_preview()}</p>
        </>
      )}

      {choosing && (
        <ChooseFonts
          value={value}
          onChoose={change}
          onClose={() => {
            setChoosing(false);
            opener.current?.focus();
          }}
        />
      )}
    </section>
  );
}

/** Where the typography came from: a pairing (linked, with how it stands now), a deleted one, or chosen directly. */
function OriginNote({ typography, origin, matchesOrigin }: { typography: Typography; origin: OriginPairing | null; matchesOrigin: boolean }) {
  if (origin) {
    return (
      <>
        {m.pairing_origin()}{" "}
        <Link to={pairingDetailPath(origin.slug)} className="underline underline-offset-2 hover:text-neutral-900">
          {origin.name}
        </Link>{" "}{origin.archived && m.pairing_origin_archived()}{" "}
        {!matchesOrigin && m.pairing_origin_changed()}
      </>
    );
  }
  return typography.originPairingDeleted ? m.pairing_origin_deleted() : m.typography_chosen_directly();
}

/**
 * "Schriften wählen": a kept type pairing (a click takes it over) or fonts
 * set directly with the catalog search of "Neues Pairing". Centered on wide
 * screens, a bottom sheet on phones; Escape closes it.
 */
function ChooseFonts({
  value,
  onChoose,
  onClose,
}: {
  value: TypographyState;
  onChoose: (next: TypographyState) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"pairing" | "direct">("pairing");

  useEffect(() => dialog.current?.showModal(), []);

  /** Closes the modal first: until then the page behind it is inert and cannot take the focus back. */
  function close() {
    dialog.current?.close();
    onClose();
  }

  function choose(next: TypographyState) {
    onChoose(next);
    close();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="choose-fonts-heading"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto w-[min(60rem,calc(100%-2rem))] max-w-none rounded-xl bg-white font-sans text-neutral-900 shadow-2xl ring-1 ring-black/10 backdrop:bg-neutral-950/25 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="choose-fonts-heading" className="text-base font-semibold tracking-tight">
            {m.typography_choose_fonts()}</h2>
          <button type="button" onClick={close} aria-label={m.action_close()} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <LanguageControl />
        <div role="radiogroup" aria-label={m.typography_source()} className="flex max-w-sm gap-1 rounded-lg bg-neutral-100 p-1 text-sm">
          {(
            [
              ["pairing", m.type_pairing_label()],
              ["direct", m.typography_choose_directly()],
            ] as const
          ).map(([option, label]) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={tab === option}
              onClick={() => setTab(option)}
              className="flex-1 rounded-md px-2 py-1.5 text-neutral-600 hover:text-neutral-900 aria-checked:bg-white aria-checked:font-medium aria-checked:text-neutral-900 aria-checked:shadow-sm"
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "pairing" ? (
          <PairingList currentId={value.origin?.id} onPick={(pairing) => choose(takeOver(pairing))} />
        ) : (
          <DirectFonts
            roles={value.typography?.roles}
            // Set directly, the fonts keep their origin: "Als Pairing merken" then compares with it.
            onApply={(roles) =>
              choose({
                typography: {
                  roles,
                  originPairingId: value.typography?.originPairingId ?? null,
                  originPairingDeleted: value.typography?.originPairingDeleted ?? false,
                  scale: null,
                },
                origin: value.origin,
              })
            }
          />
        )}
      </div>
    </dialog>
  );
}

/** The kept pairings (archived ones not), each as its name in the heading font and its families in the body font. */
function PairingList({ currentId, onPick }: { currentId: string | undefined; onPick: (pairing: OriginPairing) => void }) {
  const [pairings, setPairings] = useState<OriginPairing[]>();
  const [failed, setFailed] = useState(false);
  // One weight per family: enough for the sample, light on the network.
  const samples = (pairings ?? []).map(({ roles: { heading, body } }) => ({
    heading: { ...heading, weights: [heaviest(heading)] },
    body: { ...body, weights: [regularWeight(body)] },
  }));
  const { fontStyle } = useFontFaces(samples.flatMap(({ heading, body }) => [heading, body]));

  useEffect(() => {
    getTypePairings().then(
      (kept) => setPairings(kept.map((pairing) => ({ ...pairing, archived: false }))),
      () => setFailed(true),
    );
  }, []);

  if (failed) return <p className="text-sm text-rose-700">{m.action_failed()}</p>;
  if (!pairings) return <p className="text-sm text-neutral-500">{m.loading()}</p>;
  if (pairings.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        {m.pairings_none()}{" "}
        <Link to="/type-pairings/new" className="underline underline-offset-2 hover:text-neutral-900">
          {m.pairing_create_new()}</Link>{" "}
        {m.typography_or_direct()}</p>
    );
  }

  return (
    <ul className="-mx-2 max-h-[60vh] overflow-y-auto">
      {pairings.map((pairing, index) => (
        <li key={pairing.id}>
          <button
            type="button"
            aria-current={pairing.id === currentId || undefined}
            onClick={() => onPick(pairing)}
            className="flex w-full items-baseline justify-between gap-4 rounded-md px-2 py-2.5 text-left hover:bg-neutral-100 aria-[current]:bg-neutral-100"
          >
            <span className="min-w-0">
              <span className="block truncate text-2xl text-neutral-950" style={fontStyle(samples[index].heading)}>
                {pairing.name}
              </span>
              <span className="block truncate text-neutral-600" style={fontStyle(samples[index].body)}>
                {roleEntries(pairing.roles)
                  .map(({ font }) => font.family)
                  .join(" + ")}
              </span>
            </span>
            {pairing.id === currentId && <span className="shrink-0 text-xs text-neutral-500">{m.label_current()}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

const complete = (font: RoleFont | undefined) => Boolean(font?.family.trim() && font.weights.length > 0);

/**
 * Heading, body and optional mono with the pairing editor's pickers, started
 * from the kit's roles. "Übernehmen" is ready once heading and body each
 * have a family and a weight.
 */
function DirectFonts({ roles: start, onApply }: { roles: FontRoles | undefined; onApply: (roles: FontRoles) => void }) {
  const [roles, setRoles] = useState<Partial<FontRoles>>(start ?? {});
  const [catalogWeights, setCatalogWeights] = useState<Partial<Record<FontRole, number[]>>>({});
  const [showMono, setShowMono] = useState(Boolean(start?.mono));

  // The weights the catalog has for the kit's Fontsource families, so more can be added.
  useEffect(() => {
    if (!start) return;
    const entries = roleEntries(start).filter(({ font }) => font.fontsourceId);
    if (entries.length === 0) return;
    getCatalogFonts({ data: { ids: entries.map(({ font }) => font.fontsourceId ?? "") } }).then(
      (fonts) =>
        setCatalogWeights((current) => ({
          ...Object.fromEntries(entries.map(({ role, font }) => [role, fonts.find(({ id }) => id === font.fontsourceId)?.weights])),
          ...current,
        })),
      // Without them the picker offers the weights the family already has.
      () => undefined,
    );
  }, [start]);

  function setRole(role: FontRole, font: RoleFont | undefined, weights?: number[]) {
    setRoles((current) => ({ ...current, [role]: font }));
    setCatalogWeights((current) => ({ ...current, [role]: weights }));
  }

  const { heading, body, mono } = roles;
  useLanguageGuard({ dirty: fontRolesKey(roles) !== fontRolesKey(start ?? {}) });
  const ready = complete(heading) && complete(body) && (!mono || complete(mono));
  const pickers = (["heading", "body"] as const).map((role) => (
    <RoleFontPicker
      key={role}
      role={role}
      value={roles[role]}
      catalogWeights={catalogWeights[role]}
      onChange={(font, weights) => setRole(role, font, weights)}
    />
  ));

  return (
    <div>
      <div className="grid items-start gap-3 lg:grid-cols-3">
        {pickers}
        {showMono ? (
          <RoleFontPicker
            role="mono"
            value={mono}
            catalogWeights={catalogWeights.mono}
            onChange={(font, weights) => setRole("mono", font, weights)}
            onRemove={() => {
              setRole("mono", undefined);
              setShowMono(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowMono(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
          >
            <Plus aria-hidden className="size-4" /> {m.font_add_role({ role: fontRoleLabels.mono })}</button>
        )}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {!ready && <p className="text-xs text-neutral-500">{m.typography_roles_required()}</p>}
        <button
          type="button"
          disabled={!ready}
          onClick={() => heading && body && onApply({ heading, body, ...(mono ? { mono } : {}) })}
          className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {m.reference_take()}</button>
      </div>
    </div>
  );
}
