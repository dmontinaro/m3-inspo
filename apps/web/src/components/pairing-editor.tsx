import { pairingDetailPath } from "#/lib/page-paths";
import { useLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { fieldClassName } from "#/lib/form-styles";
import { fontRolesKey, fontRoleLabels, maxPairingNameLength, maxPairingNoteLength, pairingNameOf, sampleTexts } from "#/lib/fonts";
import type { FontRole, FontRoles, RoleFont } from "#/lib/fonts";
import { addTypePairing, updateTypePairing } from "#/server/type-pairings.functions";
import type { PairingErrors } from "#/server/type-pairings.server";
import { PairingPosterHead } from "./pairing-poster";
import { RoleFontPicker } from "./role-font-picker";

type EditedPairing = { slug: string; name: string; note: string | null; roles: FontRoles };

/**
 * The new-pairing page, also used to edit `pairing`: a live poster preview
 * above, then name and note and one picker per font role (`mono` optional).
 * Without a name the pairing is named after its families (pairingNameOf).
 * `catalogWeights` holds, per Fontsource id, the weights the catalog has for
 * the pairing's families. Saving opens the pairing's detail page; a
 * combination that is already kept links to it instead.
 */
export function PairingEditor({
  pairing,
  catalogWeights = {},
}: {
  pairing?: EditedPairing;
  catalogWeights?: Record<string, number[]>;
}) {
  const id = useId();
  const navigate = useNavigate();
  const [name, setName] = useState(pairing?.name ?? "");
  const [note, setNote] = useState(pairing?.note ?? "");
  const [roles, setRoles] = useState<Partial<FontRoles>>(pairing?.roles ?? {});
  const [weightsByRole, setWeightsByRole] = useState<Partial<Record<FontRole, number[]>>>(() => {
    const roleWeights = (font: RoleFont | undefined) => (font?.fontsourceId ? catalogWeights[font.fontsourceId] : undefined);
    return { heading: roleWeights(pairing?.roles.heading), body: roleWeights(pairing?.roles.body), mono: roleWeights(pairing?.roles.mono) };
  });
  const [showMono, setShowMono] = useState(Boolean(pairing?.roles.mono));
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<PairingErrors>({});
  const [duplicate, setDuplicate] = useState<{ slug: string; name: string }>();
  const [failed, setFailed] = useState(false);

  function setRole(role: FontRole, font: RoleFont | undefined, catalog?: number[]) {
    setRoles((current) => ({ ...current, [role]: font }));
    setWeightsByRole((current) => ({ ...current, [role]: catalog }));
    setDuplicate(undefined);
  }

  function removeMono() {
    setRole("mono", undefined);
    setShowMono(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The server names what is missing; the form sends what it has.
    const data = { name, note, roles };
    setPending(true);
    setFailed(false);
    try {
      const result = pairing ? await updateTypePairing({ data: { ...data, slug: pairing.slug } }) : await addTypePairing({ data });
      setErrors(result.status === "invalid" ? result.errors : {});
      setDuplicate(result.status === "duplicate" ? result.pairing : undefined);
      if (result.status === "saved") await navigate({ href: pairingDetailPath(result.slug) });
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  const generatedName = pairingNameOf(roles);
  useLanguageGuard({ dirty: (name.trim() || generatedName) !== (pairing?.name ?? generatedName) || note.trim() !== (pairing?.note ?? "") || fontRolesKey(roles) !== fontRolesKey(pairing?.roles ?? {}) });

  const fieldError = (messages: string[] | undefined) =>
    messages?.[0] && <p className="mt-1.5 text-sm text-rose-700">{messages[0]}</p>;

  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-24 sm:px-8">
      <Link
        to={pairing ? pairingDetailPath(pairing.slug) : "/type-pairings"}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <span aria-hidden>←</span> {pairing ? pairing.name : m.type_pairings_title()}
      </Link>

      <section aria-label={m.preview_title()} className="mt-6 rounded-xl bg-white px-5 py-8 ring-1 ring-black/5 sm:px-10 sm:py-12">
        <PairingPosterHead name={name.trim() || generatedName || m.pairing_name_placeholder()} text={note.trim() || sampleTexts.body} roles={roles} />
      </section>

      <form onSubmit={submit} className="mt-8">
        <h2 className="text-xl font-semibold tracking-tight">{pairing ? m.pairing_edit() : m.pairing_new()}</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <label htmlFor={`${id}-name`} className="text-sm font-medium text-neutral-900">
              {m.field_name()}<span className="ml-1 font-normal text-neutral-400">{m.field_optional()}</span>
            </label>
            <input
              id={`${id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={maxPairingNameLength}
              placeholder={generatedName || m.pairing_example_name()}
              className={fieldClassName}
            />
            {fieldError(errors.name)}
          </div>
          <div>
            <label htmlFor={`${id}-note`} className="text-sm font-medium text-neutral-900">
              {m.field_note()}<span className="ml-1 font-normal text-neutral-400">{m.field_optional()}</span>
            </label>
            <textarea
              id={`${id}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={maxPairingNoteLength}
              placeholder={m.pairing_note_placeholder()}
              className={fieldClassName}
            />
            {fieldError(errors.note)}
          </div>
        </div>

        <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          <RoleFontPicker
            role="heading"
            value={roles.heading}
            catalogWeights={weightsByRole.heading}
            onChange={(font, catalog) => setRole("heading", font, catalog)}
          />
          <RoleFontPicker
            role="body"
            value={roles.body}
            catalogWeights={weightsByRole.body}
            onChange={(font, catalog) => setRole("body", font, catalog)}
          />
          {showMono ? (
            <RoleFontPicker
              role="mono"
              value={roles.mono}
              catalogWeights={weightsByRole.mono}
              onChange={(font, catalog) => setRole("mono", font, catalog)}
              onRemove={removeMono}
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

        {fieldError(errors.roles)}
        {duplicate && (
          <p role="status" className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {m.pairing_already_kept()}{" "}
            <Link to={pairingDetailPath(duplicate.slug)} className="font-medium underline underline-offset-2">
              {duplicate.name}
            </Link>
            {" "}{m.pairing_duplicate_help()}</p>
        )}
        {failed && (
          <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {m.action_failed()}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Link
            to={pairing ? pairingDetailPath(pairing.slug) : "/type-pairings"}
            className="rounded-md px-3.5 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            {m.action_cancel()}</Link>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {pairing ? m.action_save() : m.pairing_keep()}
          </button>
        </div>
      </form>
    </main>
  );
}
