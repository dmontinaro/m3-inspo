import { createContext, use, useEffect, useId, useRef, useState, useCallback } from "react";
import { normalizeTag } from "#/lib/tags";
import type { ReactNode } from "react";
import * as m from "#/paraglide/messages.js";
import { getLocale, setLocale } from "#/paraglide/runtime.js";
import type { Locale } from "#/paraglide/runtime.js";
import { allowLanguageReload, languageOperations } from "#/lib/language-operations";

type Guard = { dirty?: boolean | (() => boolean); blocker?: string; flush?: () => void | Promise<void> };
type Choice = { locale: Locale; trigger: HTMLElement };
type LanguageContext = { guards: Map<string, () => Guard>; choose: (choice: Choice) => void };
const Context = createContext<LanguageContext | null>(null);

/** All page and modal selectors share one loss warning and one reload. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [guards] = useState(() => new Map<string, () => Guard>());
  const [choice, setChoice] = useState<Choice | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const errorTrigger = useRef<HTMLElement | null>(null);

  function blocker(): string | undefined {
    if (languageOperations.has("upload")) return m.language_block_upload();
    if (languageOperations.has("oauth")) return m.language_block_oauth();
    if (languageOperations.has("mutation")) return m.language_block_mutation();
    for (const read of guards.values()) if (read().blocker) return read().blocker;
  }
  function dirty() {
    return [...guards.values()].some((read) => {
      const value = read().dirty;
      return typeof value === "function" ? value() : value;
    });
  }
  function dismiss() {
    const trigger = choice?.trigger ?? errorTrigger.current;
    dialog.current?.close();
    setChoice(null);
    setError("");
    trigger?.focus();
  }
  async function commit(selected: Choice) {
    if (busy.current) return;
    busy.current = true;
    let reloading = false;
    try {
      const blocked = blocker();
      if (blocked) { setError(blocked); setChoice(null); return; }
      // Complete debounced URL state before reading the URL to reload.
      for (const read of guards.values()) await read().flush?.();
      const blockedAfterFlush = blocker();
      if (blockedAfterFlush) { setError(blockedAfterFlush); setChoice(null); return; }
      await setLocale(selected.locale, { reload: false });
      if (!document.cookie.split(";").some((cookie) => cookie.trim() === `PARAGLIDE_LOCALE=${selected.locale}`)) throw new Error("Locale cookie unavailable");
      allowLanguageReload();
      reloading = true;
      window.location.reload();
    } catch {
      setChoice(null);
      setError(m.language_cookie_failed());
    } finally { if (!reloading) busy.current = false; }
  }
  function choose(selected: Choice) {
    if (selected.locale === getLocale() || busy.current || choice || error) return;
    errorTrigger.current = selected.trigger;
    const blocked = blocker();
    if (blocked) { setError(blocked); return; }
    if (dirty()) setChoice(selected);
    else void commit(selected);
  }
  useEffect(() => {
    if (!choice && !error) return;
    dialog.current?.showModal();
    cancelButton.current?.focus();
  }, [choice, error]);

  return (
    <Context value={{ guards, choose }}>
      {children}
      <dialog data-language-warning ref={dialog} aria-labelledby="language-warning-title" aria-describedby="language-warning-body"
        onCancel={(event) => { event.preventDefault(); dismiss(); }}
        className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-xl bg-white p-6 text-neutral-900 shadow-xl backdrop:bg-neutral-950/30">
        <h2 id="language-warning-title" className="text-lg font-semibold">{error ? m.language_block_title() : m.language_discard_title()}</h2>
        <p id="language-warning-body" role={error ? "alert" : undefined} className="mt-3 text-sm leading-relaxed text-neutral-700">{error || m.language_discard_help()}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancelButton} type="button" onClick={dismiss} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">{error ? m.action_close() : m.action_cancel()}</button>
          {choice && !error && <button type="button" onClick={() => void commit(choice)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">{m.language_discard_confirm()}</button>}
        </div>
      </dialog>
    </Context>
  );
}

export function LanguageControl() {
  const context = use(Context);
  const id = useId();
  if (!context) throw new Error("LanguageControl requires LanguageProvider");
  return (
    <div data-language-control className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <label htmlFor={id} className="text-neutral-600">{m.language_label()}</label>
      <select id={id} value={getLocale()} data-language-control onChange={(event) => {
        const locale = event.currentTarget.value;
        const trigger = event.currentTarget;
        trigger.value = getLocale();
        if (locale === "en" || locale === "de") context.choose({ locale, trigger });
      }} className="min-h-10 rounded-md border border-neutral-300 bg-white px-2 text-neutral-900">
        <option value="en" lang="en">English</option><option value="de" lang="de">Deutsch</option>
      </select>
    </div>
  );
}

/** Reads current state at the final cookie boundary, including mutations started while a warning is open. */
export function useLanguageGuard(guard: Guard) {
  const context = use(Context);
  const id = useId();
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => {
    if (!context) return;
    context.guards.set(id, () => latest.current);
    return () => { context.guards.delete(id); };
  }, [context?.guards, id]);
}

/** Uncontrolled fields use their DOM defaults; submitted values become the baseline only after success. */
export function useFormLanguageGuard() {
  const form = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  function read(defaults = false) {
    type FieldValue = [string, string | boolean | [string, number, number][]];
    const fields = [...form.current?.elements ?? []].flatMap<FieldValue>((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) || element.hasAttribute("data-language-control")) return [];
      if (element instanceof HTMLInputElement && (element.type === "submit" || element.type === "button")) return [];
      if (element instanceof HTMLInputElement && element.type === "file") return [[element.name, [...element.files ?? []].map((file) => [file.name, file.size, file.lastModified])]];
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) return [[element.name || element.id, defaults ? element.defaultChecked : element.checked]];
      const value = defaults && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) ? element.defaultValue : element.value;
      let normalized = value.trim();
      if (element.name === "project") normalized = normalizeTag(value);
      if ((element.name === "sourceUrl" || element.name === "url") && normalized && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)) normalized = `https://${normalized}`;
      return [[element.name || element.id, normalized]];
    });
    const tags = fields.flatMap(([name, value]) => name === "tags" && typeof value === "string" ? value.split(",").map(normalizeTag).filter(Boolean) : []);
    return JSON.stringify([...fields.filter(([name]) => name !== "tags" && name !== "confirmDuplicate"), ["tags", [...new Set(tags)]]]);
  }

  useLanguageGuard({ dirty: () => form.current !== null && read() !== (baseline.current ?? read(true)) });
  const attach = useCallback((node: HTMLFormElement | null) => {
    if (form.current === node) return;
    form.current = node;
    baseline.current = node ? read() : null;
  }, []);
  return { form: attach, reset: () => { baseline.current = null; }, snapshot: () => read(), saved: (submitted: string) => { baseline.current = submitted; } };
}
