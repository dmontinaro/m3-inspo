/**
 * A kit's lifecycle (#48): on its page the status switch under the title,
 * "Duplizieren" and "Endgültig löschen" at the end; in the list a delete
 * button on each card.
 */

import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import type { BrandKitStatus } from "@m3-inspo/db/library-schema";
import { brandKitStatuses } from "#/lib/brand-kits";
import { statusLabels } from "#/lib/curation";
import { deleteBrandKit, duplicateBrandKit, setBrandKitStatus } from "#/server/brand-kits.functions";
import type { getBrandKit } from "#/server/brand-kits.functions";
import { ProjectChip, statusDots } from "./parts";

type Kit = Pick<Awaited<ReturnType<typeof getBrandKit>>, "slug" | "name" | "project" | "status" | "approvedInProject">;

const failedMessage = "Das hat nicht geklappt. Bitte versuche es noch einmal.";

/** Runs one change of the kit, then `done` with its answer; `failed` says the last one did not go through. */
function useKitChange() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change<T>(action: () => Promise<T>, done: (result: T) => Promise<unknown>) {
    setPending(true);
    setFailed(false);
    try {
      await done(await action());
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return { pending, failed, change };
}

function deleteQuestion(name: string) {
  return `„${name}“ endgültig löschen? Das Kit verschwindet mit seinen Hinweisen, die Referenzen bleiben. Das lässt sich nicht rückgängig machen.`;
}

/**
 * The trash button on a kit's card in the list, for doubles: asks first,
 * then reloads the list. Sits over the card's colours, visible on hover or
 * focus (always on touch screens).
 */
export function KitDeleteButton({ kit }: { kit: Pick<Kit, "slug" | "name"> }) {
  const router = useRouter();
  const { pending, failed, change } = useKitChange();

  function remove() {
    if (!window.confirm(deleteQuestion(kit.name))) return;
    return change(
      () => deleteBrandKit({ data: { slug: kit.slug } }),
      () => router.invalidate(),
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={`„${kit.name}“ löschen`}
        title="Löschen"
        disabled={pending}
        onClick={remove}
        className="absolute top-2.5 right-2.5 rounded-md bg-white/90 p-1.5 text-neutral-500 opacity-0 shadow-sm ring-1 ring-black/5 group-hover/card:opacity-100 hover:bg-white hover:text-rose-700 focus-visible:opacity-100 disabled:opacity-60 [@media(hover:none)]:opacity-100"
      >
        <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
      {failed && (
        <p role="alert" className="mt-1 text-xs text-rose-700">
          {failedMessage}
        </p>
      )}
    </>
  );
}

function statusHint({ status, project }: Kit) {
  if (status === "draft") return "Nur für dich sichtbar. Agenten sehen Entwürfe nicht.";
  if (status === "archived") return "Für Agenten unsichtbar. Nicht gelöscht; „Entwurf“ holt es zurück.";
  return project ? `Gilt für das Projekt ${project}. Agenten sehen es über MCP.` : "Agenten sehen es über MCP.";
}

/**
 * Entwurf, Freigegeben, Archiviert as one segmented control with the
 * project, and what the current status means for agents. Approving while
 * another kit of the project is approved asks first, in a panel floating
 * below (the header row keeps its layout): that kit goes back to draft.
 * The panel takes the focus; Escape and "Abbrechen" hand it back.
 */
export function KitStatusControl({ kit }: { kit: Kit }) {
  const router = useRouter();
  const { pending, failed, change } = useKitChange();
  const [confirming, setConfirming] = useState(false);
  const approveButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const other = kit.approvedInProject;

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  function save(status: BrandKitStatus) {
    return change(
      () => setBrandKitStatus({ data: { slug: kit.slug, status } }),
      async () => {
        await router.invalidate();
        setConfirming(false);
      },
    );
  }

  function choose(status: BrandKitStatus) {
    if (status === kit.status) return;
    if (status === "approved" && other) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void save(status);
  }

  function cancel() {
    setConfirming(false);
    approveButton.current?.focus();
  }

  return (
    <div className="relative mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Status" className="flex rounded-lg bg-neutral-200/70 p-0.5 text-sm">
          {brandKitStatuses.map((option) => (
            <button
              key={option}
              ref={option === "approved" ? approveButton : undefined}
              type="button"
              disabled={pending}
              aria-pressed={option === kit.status}
              onClick={() => choose(option)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-neutral-600 hover:text-neutral-900 disabled:cursor-default aria-pressed:bg-white aria-pressed:font-medium aria-pressed:text-neutral-900 aria-pressed:shadow-sm"
            >
              <span aria-hidden className={`size-1.5 rounded-full ${statusDots[option]}`} />
              {statusLabels[option]}
            </button>
          ))}
        </div>
        {kit.project && <ProjectChip project={kit.project} />}
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">{statusHint(kit)}</p>
      {failed && (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {failedMessage}
        </p>
      )}

      {confirming && other && (
        <div
          role="dialog"
          aria-label="Freigabe ersetzen"
          aria-describedby="kit-approve-question"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) cancel();
          }}
          className="absolute top-full left-0 z-20 mt-2 w-[min(36rem,calc(100vw-2.5rem))] rounded-lg bg-white p-4 text-sm shadow-lg shadow-black/10 ring-1 ring-neutral-200"
        >
          <p id="kit-approve-question" className="text-neutral-800">
            Für {kit.project} ist schon „{other.name}“ freigegeben. Gibst du dieses Kit frei, wird „{other.name}“ wieder Entwurf.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={cancel}
              className="rounded-md px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
            >
              Abbrechen
            </button>
            <button
              ref={confirmButton}
              type="button"
              disabled={pending}
              onClick={() => save("approved")}
              className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
            >
              {pending ? "Gibt frei …" : "Dieses freigeben"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Duplizieren" opens a draft copy, keeping the page's unsaved changes as
 * the copy's; "Endgültig löschen" asks first, then returns to the list.
 */
export function KitManageActions({ kit }: { kit: Kit }) {
  const router = useRouter();
  const { pending, failed, change } = useKitChange();

  function duplicate() {
    return change(
      () => duplicateBrandKit({ data: { slug: kit.slug } }),
      // The same search: the colour parameters of unsaved changes become the copy's.
      (copy) => router.navigate({ to: "/brand-kits/$slug", params: { slug: copy.slug }, search: (previous) => previous }),
    );
  }

  function remove() {
    if (!window.confirm(deleteQuestion(kit.name))) return;
    return change(
      () => deleteBrandKit({ data: { slug: kit.slug } }),
      () => router.navigate({ to: "/brand-kits" }),
    );
  }

  return (
    <div className="mt-12 border-t border-neutral-200 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={duplicate}
          className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-60"
        >
          <Copy aria-hidden className="size-4" strokeWidth={1.75} />
          Duplizieren
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="ml-auto rounded-md px-2.5 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          Endgültig löschen
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {failedMessage}
        </p>
      )}
    </div>
  );
}
