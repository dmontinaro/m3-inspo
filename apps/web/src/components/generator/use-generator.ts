import { useEffect, useRef, useState } from "react";
import { randomSeed } from "@m3-inspo/shared/color-scheme";
import { addExtra, record, rollDraft, startHistory, undo } from "#/lib/generator";
import type { Draft, GeneratorReference, History, PoolData } from "#/lib/generator";

/**
 * The generator's working state: the undo history over drafts and the steps
 * the page offers. Where the state goes (the URL on /generator, a saved kit
 * later) is the caller's business; it reads `draft`.
 *
 * ```ts
 * const generator = useGenerator(initialDraft, poolData);
 * generator.apply((draft) => cycleLock(draft, "brand"));
 * generator.apply((draft) => adjustColor(draft, 0, hex), gesture); // a slider drag: one undo step
 * ```
 */
export function useGenerator(initial: Draft, poolData: PoolData) {
  const [history, setHistory] = useState<History>(() => startHistory(initial));
  const draft = history.present;
  const colors = poolData.colors;

  return {
    draft,
    canUndo: history.past.length > 0,
    /** One step; changes with the same `gesture` (one slider drag) make one undo step together. */
    apply: (step: (draft: Draft) => Draft, gesture?: number) => setHistory((current) => record(current, step(current.present), gesture)),
    roll: () => setHistory((current) => record(current, rollDraft(current.present, colors, randomSeed()))),
    addExtra: () => setHistory((current) => record(current, addExtra(current.present, colors, randomSeed()))),
    undo: () => setHistory(undo),
    /** Starts over from another draft, e.g. when the URL changed from outside. */
    reset: (next: Draft) => setHistory(startHistory(next)),
  };
}

export type Generator = ReturnType<typeof useGenerator>;

/**
 * Every reference the generator has seen in this visit, by id: pool and
 * linked ones, also from pools it has left, so a colour keeps its `@slug`
 * and its origin title after the pool changes.
 */
export function useKnownReferences(poolData: PoolData): ReadonlyMap<string, GeneratorReference> {
  const known = useRef(new Map<string, GeneratorReference>());
  for (const reference of [...poolData.references, ...poolData.linked.references]) known.current.set(reference.id, reference);
  return known.current;
}

/** Where keys belong to the field: typing. */
const TEXT_FIELDS = "input, textarea, select, [contenteditable]";

/** Where Space belongs to the control: it activates a focused button, link or menu entry. */
const CONTROLS = `${TEXT_FIELDS}, button, a[href], summary, [role^=menuitem], [role=option], [role=button], [role=checkbox], [role=switch], [role=tab]`;

/**
 * Space rolls, `Z` undoes. Never while typing, with a modifier or while
 * `paused` (an open colour picker owns the keyboard); Space also leaves a
 * focused control alone (the "Würfeln" button rolls on its own) and does
 * not repeat while held.
 */
export function useGeneratorKeys({ roll, undo: undoStep }: Pick<Generator, "roll" | "undo">, paused: boolean) {
  useEffect(() => {
    if (paused) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      // Keys in a dialog over the page (a kit's "Schriften wählen") are the dialog's.
      if (target?.closest("dialog")) return;
      if (event.code === "Space") {
        if (target?.closest(CONTROLS)) return;
        // Held down, it neither rolls again nor scrolls the page.
        event.preventDefault();
        if (!event.repeat) roll();
      } else if ((event.key === "z" || event.key === "Z") && !target?.closest(TEXT_FIELDS)) {
        event.preventDefault();
        undoStep();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, roll, undoStep]);
}
