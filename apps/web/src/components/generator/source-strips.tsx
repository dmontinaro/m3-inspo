import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { MAX_EXTRAS, STEPS } from "@m3-inspo/shared/color-scheme";
import type { ColorSchemeSnapshot, SourceKey } from "@m3-inspo/shared/color-scheme";
import { cycleLock, getSource, moveExtra, removeExtra } from "#/lib/generator";
import type { Draft, GeneratorReference } from "#/lib/generator";
import { LockIcon, describeOrigin, inkOn, lockHints, lockLabels, sourceLabel } from "./parts";
import type { Generator } from "./use-generator";

type Props = {
  draft: Draft;
  snapshot: ColorSchemeSnapshot;
  references: ReadonlyMap<string, GeneratorReference>;
  apply: Generator["apply"];
  onAdd: () => void;
  /** A click on a strip: open the colour picker next to `opener`, the strip's button, which gets the focus back afterwards. */
  onOpen: (key: SourceKey, opener: HTMLElement) => void;
};

/**
 * The source colours as large strips side by side (rows on phones): brand,
 * neutral, the extras and a button for one more. A strip shows name, hex and
 * origin, its lock (a click cycles it) and, on hover, its scale. Text sits
 * at full strength in white or black, so even the small origin line keeps
 * 4.5 : 1; the chips darken a white-ink strip and lighten a black-ink one,
 * which only raises that contrast. The extras can be dragged into another
 * order (useExtraOrder); Marke and Neutral stay in front.
 */
export function SourceStrips({ draft, snapshot, references, apply, onAdd, onOpen }: Props) {
  const order = useExtraOrder(draft, apply);
  const { sources } = order.shown;
  const keys: SourceKey[] = ["brand", "neutral", ...sources.extras.keys()];
  const dense = keys.length > 4;
  const movable = sources.extras.length > 1;

  return (
    <div
      ref={order.container}
      className={`flex flex-col overflow-hidden rounded-2xl ring-1 ring-black/5 sm:h-72 sm:flex-row ${order.drag ? "cursor-grabbing [&_*]:cursor-grabbing" : ""}`}
    >
      {keys.map((key) => {
        const source = getSource(sources, key);
        const label = sourceLabel(sources, key);
        const extra = typeof key === "number" ? key : null;
        const dragged = order.drag !== null && order.drag.to === extra;
        const ink = inkOn(source.hex);
        const scale = snapshot.scales.find((candidate) => candidate.name === (typeof key === "number" ? label : key));
        const chip = ink === "#ffffff" ? "bg-black/15 hover:bg-black/25" : "bg-white/30 hover:bg-white/45";
        return (
          <div
            key={typeof key === "number" ? `extra-${key}` : key}
            ref={(strip) => {
              if (extra !== null) order.strips.current[extra] = strip;
            }}
            // Without the colour fade while dragging: the places swap colours, they should not blend.
            className={`group relative flex min-h-[5.5rem] min-w-0 flex-1 items-center gap-3 px-4 py-3 sm:min-h-0 sm:flex-col sm:items-stretch sm:justify-between sm:p-5 ${
              order.drag ? "" : "transition-[background-color] duration-200 ease-out"
            } ${dragged ? "z-10 shadow-2xl shadow-black/40" : ""}`}
            style={{ background: source.hex, color: ink, transform: dragged && order.drag ? translate(order.drag.offset, order.drag.horizontal) : undefined }}
          >
            <button
              type="button"
              aria-label={`${label} anpassen`}
              onClick={(event) => {
                if (!order.justDropped.current) onOpen(key, event.currentTarget);
              }}
              onPointerDown={(event) => {
                if (extra !== null && movable && event.pointerType === "mouse") order.start(event, extra, DRAG_THRESHOLD);
              }}
              className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-current"
            />

            <div className="pointer-events-none relative min-w-0 flex-1 sm:order-2 sm:flex-none">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className={`font-semibold tracking-tight uppercase tabular-nums ${dense ? "text-xl sm:text-2xl" : "text-2xl sm:text-[1.75rem]"}`}>
                {source.hex.slice(1)}
              </p>
              <p className="mt-0.5 truncate text-xs">{describeOrigin(source.origin, references)}</p>
            </div>

            <div className="relative flex shrink-0 items-center gap-1 sm:order-1">
              <button
                type="button"
                onClick={() => apply((current) => cycleLock(current, key))}
                title={`${lockHints[source.lock]}. Klicken zum Wechseln.`}
                aria-label={`Sperre ${label}: ${lockLabels[source.lock]}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${chip}`}
              >
                <LockIcon lock={source.lock} />
                <span className={dense ? "sm:hidden lg:inline" : ""}>{lockLabels[source.lock]}</span>
              </button>
              {extra !== null && movable && (
                <button
                  type="button"
                  ref={(handle) => {
                    order.handles.current[extra] = handle;
                  }}
                  onPointerDown={(event) => order.start(event, extra, 0)}
                  onKeyDown={(event) => order.onKey(event, extra)}
                  title={`${label} verschieben: ziehen oder Pfeiltasten`}
                  aria-label={`${label} verschieben`}
                  className={`cursor-grab touch-none rounded-full p-1.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 ${chip}`}
                >
                  <GripVertical aria-hidden className="size-3.5 sm:rotate-90" strokeWidth={2} />
                </button>
              )}
              {typeof key === "number" && (
                <button
                  type="button"
                  onClick={() => apply((current) => removeExtra(current, key))}
                  title={`${label} entfernen`}
                  aria-label={`${label} entfernen`}
                  className={`rounded-full p-1.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 ${chip}`}
                >
                  <X aria-hidden className="size-3.5" strokeWidth={2} />
                </button>
              )}
            </div>

            {scale && (
              <div className="pointer-events-none absolute inset-y-4 right-4 hidden w-6 flex-col overflow-hidden rounded-md opacity-0 ring-1 ring-black/10 transition-opacity duration-200 group-hover:opacity-100 sm:flex">
                {STEPS.map((step) => (
                  <span key={step} className="flex-1" style={{ background: scale.steps[step] }} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {draft.sources.extras.length < MAX_EXTRAS && (
        <button
          type="button"
          onClick={onAdd}
          title="Zusatzfarbe hinzufügen. Gewürfelt wird nur die neue."
          className="flex h-12 shrink-0 items-center justify-center gap-1.5 bg-neutral-200/70 text-sm text-neutral-600 hover:bg-neutral-300/70 hover:text-neutral-900 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-neutral-900 sm:h-auto sm:w-16 sm:flex-col sm:gap-1 sm:text-xs"
        >
          <Plus aria-hidden className="size-5" strokeWidth={1.75} />
          Farbe
        </button>
      )}
    </div>
  );
}

/** How far a mouse press on a strip moves before it drags instead of opening the picker. */
const DRAG_THRESHOLD = 5;

/** How the other strips slide out of the dragged one's way, and how it settles when dropped. */
const SLIDE: KeyframeAnimationOptions = { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" };

const arrowSteps: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** The dragged extra: where it started, the place it would drop to, and how far it sits off that place. */
type Drag = { from: number; to: number; offset: number; horizontal: boolean };

const translate = (px: number, horizontal: boolean) => (horizontal ? `translateX(${px}px)` : `translateY(${px}px)`);

/**
 * Reordering the extras. A strip dragged by its handle, or with a mouse
 * anywhere on it, follows the pointer along the extras while the others
 * slide out of its way; `shown` is the draft in that order. Dropping it
 * moves it there as one undo step. The arrow keys on the handle move it by
 * one place, the focus goes along. The strips keep their places in the
 * DOM, only their colours change places.
 */
function useExtraOrder(draft: Draft, apply: Generator["apply"]) {
  const container = useRef<HTMLDivElement>(null);
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  // A drop lets the click that follows it pass without opening the picker.
  const justDropped = useRef(false);
  const focusAfterMove = useRef<number | null>(null);

  useEffect(() => {
    if (focusAfterMove.current === null) return;
    handles.current[focusAfterMove.current]?.focus();
    focusAfterMove.current = null;
  });

  /** From a pointer down on extra `from`: dragging starts once the pointer has moved `threshold` pixels. */
  function start(event: ReactPointerEvent, from: number, threshold: number) {
    const count = draft.sources.extras.length;
    if (event.button !== 0 || !container.current) return;
    // Side by side from `sm` on, one below the other on phones.
    const horizontal = getComputedStyle(container.current).flexDirection === "row";
    const slots = strips.current.slice(0, count).map((strip) => strip?.getBoundingClientRect());
    if (!slots.every((slot): slot is DOMRect => slot !== undefined)) return;
    const begin = (slot: DOMRect) => (horizontal ? slot.left : slot.top);
    const middle = (slot: DOMRect) => begin(slot) + (horizontal ? slot.width : slot.height) / 2;
    const at = (pointer: PointerEvent | ReactPointerEvent) => (horizontal ? pointer.clientX : pointer.clientY);
    const origin = at(event);
    // The strip travels from the first extra's place to the last one's, not over Marke and Neutral.
    const [min, max] = [begin(slots[0]) - begin(slots[from]), begin(slots[count - 1]) - begin(slots[from])];
    let to = from;
    let offset = 0;
    let dragging = false;
    justDropped.current = false;

    // The colours between `a` and `b` move one place towards `a`; each slides in from where it was.
    const slide = (a: number, b: number) => {
      const step = b > a ? 1 : -1;
      for (let place = a; place !== b; place += step) {
        strips.current[place]?.animate([{ transform: translate(begin(slots[place + step]) - begin(slots[place]), horizontal) }, { transform: "none" }], SLIDE);
      }
      // The dragged strip's new place drops a slide still running there, which would hold it back.
      strips.current[b]?.getAnimations().forEach((animation) => animation.cancel());
    };

    const move = (pointer: PointerEvent) => {
      const delta = Math.min(max, Math.max(min, at(pointer) - origin));
      if (!dragging && Math.abs(at(pointer) - origin) < threshold) return;
      dragging = true;
      const center = middle(slots[from]) + delta;
      const next = slots.reduce((best, slot, place) => (Math.abs(middle(slot) - center) < Math.abs(middle(slots[best]) - center) ? place : best), from);
      if (next !== to) slide(to, next);
      to = next;
      offset = delta - (begin(slots[to]) - begin(slots[from]));
      setDrag({ from, to, offset, horizontal });
    };

    const listeners = new AbortController();
    const drop = () => {
      listeners.abort();
      if (!dragging) return;
      justDropped.current = true;
      window.setTimeout(() => (justDropped.current = false));
      setDrag(null);
      apply((current) => moveExtra(current, from, to));
      strips.current[to]?.animate([{ transform: translate(offset, horizontal) }, { transform: "none" }], SLIDE);
    };
    window.addEventListener("pointermove", move, { signal: listeners.signal });
    window.addEventListener("pointerup", drop, { signal: listeners.signal });
    window.addEventListener("pointercancel", drop, { signal: listeners.signal });
  }

  function onKey(event: KeyboardEvent, from: number) {
    const step = arrowSteps[event.key];
    if (step === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const to = from + step;
    if (to < 0 || to >= draft.sources.extras.length) return;
    focusAfterMove.current = to;
    apply((current) => moveExtra(current, from, to));
  }

  const shown = drag ? moveExtra(draft, drag.from, drag.to) : draft;
  return { container, strips, handles, drag, shown, start, onKey, justDropped };
}
