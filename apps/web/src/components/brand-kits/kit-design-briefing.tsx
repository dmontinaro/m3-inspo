import { briefingTemplate } from "#/lib/briefing-content";
import { contentLanguageForUi } from "#/lib/format";
import { getLocale } from "#/paraglide/runtime.js";
import { confirmedLanguageReload } from "#/lib/language-operations";
import { useLanguageGuard, LanguageControl  } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, NotebookPen, Sparkles, X } from "lucide-react";
import { maxDesignBriefingLength } from "#/lib/brand-kits";
import { MarkdownEditor } from "#/components/markdown-editor";
import { draftBrandKitDesignBriefing, updateBrandKitDesignBriefing } from "#/server/brand-kits.functions";

type BriefingState = "idle" | "pending" | "saved" | "failed" | "drafting" | "drafted" | "draft-failed" | "draft-disabled";

/** The status line under the editor while it is not simply idle. */
const stateMessages: Partial<Record<BriefingState, string>> = {
  get failed() { return m.briefing_save_failed(); },
  get saved() { return m.briefing_saved(); },
  get pending() { return m.briefing_saving(); },
  get drafting() { return m.briefing_drafting(); },
  get drafted() { return m.briefing_drafted(); },
  get "draft-failed"() { return m.briefing_draft_failed(); },
  get "draft-disabled"() { return m.briefing_disabled(); },
};

/**
 * The kit's brand-specific patterns, saved separately and exported verbatim as DESIGN.md.
 * A "Design-Briefing" button (in the page's header actions) opens them in a side panel
 * on the right, over the page; Escape or the X closes it. Closing only hides the panel,
 * so unsaved text stays, and the button carries a dot while it does. "Mit KI entwerfen"
 * puts a draft from Claude into the editor, unsaved, after asking before it replaces text.
 */
export function KitDesignBriefing({
  slug,
  name,
  briefing,
  approved,
  onSaved,
}: {
  slug: string;
  name: string;
  briefing: string | null;
  approved: boolean;
  onSaved: () => Promise<void>;
}) {
  const [text, setText] = useState(briefing ?? "");
  const [state, setState] = useState<BriefingState>("idle");
  const [savedText, setSavedText] = useState(briefing ?? "");
  const dirty = (text.trim() ? text : "") !== savedText;
  const pending = state === "pending" || state === "drafting";
  const [open, setOpen] = useState(false);
  useLanguageGuard({ dirty, blocker: pending ? m.language_block_briefing() : undefined });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Escape from inside the panel closes it, unless something inside handled it.
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && event.target instanceof Node && panel.current?.contains(event.target)) close();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname && dirty && !window.confirm(m.briefing_leave_confirm()),
    enableBeforeUnload: () => dirty && !confirmedLanguageReload,
  });

  async function save() {
    const submitted = text;
    setState("pending");
    try {
      await updateBrandKitDesignBriefing({ data: { slug, designBriefing: submitted } });
      setSavedText(submitted.trim() ? submitted : "");
      await onSaved();
      setText((latest) => latest === submitted && !submitted.trim() ? "" : latest);
      setState("saved");
    } catch {
      setState("failed");
    }
  }

  async function draft() {
    if (text.trim() && !window.confirm(m.briefing_replace_confirm())) return;
    setState("drafting");
    try {
      const result = await draftBrandKitDesignBriefing({ data: { slug } });
      if (result.ok) setText(result.briefing);
      setState(result.ok ? "drafted" : result.reason === "disabled" ? "draft-disabled" : "draft-failed");
    } catch {
      setState("draft-failed");
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="kit-design-briefing-panel"
        onClick={() => (open ? close() : setOpen(true))}
        className="relative flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 aria-expanded:bg-neutral-100"
      >
        <NotebookPen aria-hidden className="size-4" strokeWidth={2} />
        {m.briefing_title()}{dirty && (
          <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-white">
            <span className="sr-only">{m.unsaved_indicator()}</span>
          </span>
        )}
      </button>
      <section
        ref={panel}
        id="kit-design-briefing-panel"
        aria-labelledby="kit-design-briefing"
        tabIndex={-1}
        hidden={!open}
        className="fixed inset-y-0 right-0 z-50 w-[min(40rem,100%)] overflow-y-auto overscroll-contain border-l border-neutral-200 bg-white p-5 text-neutral-900 shadow-2xl shadow-black/15 outline-none sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 id="kit-design-briefing" className="text-lg font-semibold tracking-tight">{m.briefing_title()}</h2>
              <button
                type="button"
                onClick={close}
                aria-label={m.briefing_close()}
                className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <p id="kit-design-briefing-help" className="mt-1 text-sm leading-relaxed text-neutral-600">
              {m.briefing_help()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={draft}
            disabled={pending}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            {state === "drafting" ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4 text-violet-600" />}
            {state === "drafting" ? m.briefing_drafting_action() : m.briefing_draft_action()}
          </button>
          {briefing && (
            <a
              href={`data:text/markdown;charset=utf-8,${encodeURIComponent(briefing)}`}
              download="DESIGN.md"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              <Download aria-hidden className="size-4" />
              {m.briefing_download()}</a>
          )}
          </div>
        </div>
        <LanguageControl />
        <MarkdownEditor
          labelledBy="kit-design-briefing"
          describedBy="kit-design-briefing-help kit-design-briefing-status"
          value={text}
          onChange={(changed) => { setText(changed); setState("idle"); }}
          disabled={pending}
          maxLength={maxDesignBriefingLength}
          placeholder={briefingTemplate(name, contentLanguageForUi(getLocale()))}
        />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl text-xs leading-relaxed text-neutral-600">
            <p id="kit-design-briefing-status" role={state === "failed" || state === "draft-failed" ? "alert" : "status"}>
              {stateMessages[state] ??
                (dirty ? m.briefing_download_unsaved() : m.briefing_download_saved())}
            </p>
            <p className="mt-1">
              {approved
                ? m.briefing_approved_help()
                : m.briefing_unapproved_help()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!text && !briefing && (
              <button
                type="button"
                onClick={() => {
                  setText(briefingTemplate(name, contentLanguageForUi(getLocale())));
                  setState("idle");
                }}
                className="min-h-10 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              >
                {m.briefing_insert_template()}</button>
            )}
            {dirty && (
              <button
                type="button"
                disabled={pending}
                onClick={() => { setText(briefing ?? ""); setState("idle"); }}
                className="min-h-10 rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              >
                {m.action_discard()}</button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              className="min-h-10 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              {pending ? m.action_saving() : m.briefing_save()}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
