import { formatNumber } from "#/lib/format";
import { useLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatOklch, hexToOklch, normalizeHex, oklchToHex } from "@m3-inspo/shared";
import type { OkLch } from "@m3-inspo/shared";
import { checkExtraName } from "@m3-inspo/shared/color-scheme";
import type { Lock, SourceColor, SourceKey } from "@m3-inspo/shared/color-scheme";
import { adjustColor, getSource, renameExtra, replaceSource, setLock, takeFromReference } from "#/lib/generator";
import type { Draft, PoolData } from "#/lib/generator";
import { useDismiss } from "../use-dismiss";
import { LockIcon, lockHints, lockLabels, sourceLabel } from "./parts";
import { ReferenceColors } from "./reference-colors";
import type { Generator } from "./use-generator";

const WIDTH = 296;
/** The height to place the picker by until it has measured itself. */
const ESTIMATED_HEIGHT = 440;
/** Space kept between the picker and the strip or the window's edge. */
const GAP = 8;
/** Upper end of the chroma slider; sRGB rarely goes beyond. */
const MAX_SLIDER_CHROMA = 0.32;

/** Each slider drag, typed hex or name edit is a gesture of its own: one undo step. */
let lastGesture = 0;
const newGesture = () => ++lastGesture;

const locks: Lock[] = ["open", "hue", "exact"];

const nameProblems = {
  get invalid() { return m.color_name_format(); },
  get reserved() { return m.color_name_reserved(); },
  get taken() { return m.color_name_duplicate(); },
};

const modes = [
  { value: "adjust", get label() { return m.color_adjust(); } },
  { value: "reference", get label() { return m.color_from_reference(); } },
] as const;

/**
 * `opener` is the strip's button: the picker opens next to it and gives it the focus back when it closes.
 * `pool` offers its references and their measured colours under "Aus Referenz".
 */
type Props = {
  draft: Draft;
  sourceKey: SourceKey;
  opener: HTMLElement;
  pool: Pick<PoolData, "references" | "colors">;
  apply: Generator["apply"];
  onClose: () => void;
};

/**
 * Popover next to a strip for one source colour, in two modes. "Anpassen"
 * nudges it: OKLCH sliders (so "a bit darker" keeps the hue) and, for an
 * extra colour, its name. "Aus Referenz" takes a measured colour of a pool
 * reference or, by pipette, a pixel of its image. Hex field, lock and
 * "Wie vorher" serve both. Changes apply live and lock the colour exactly.
 * Closes on Escape or a click outside.
 */
export function ColorPicker({ draft, sourceKey, opener, pool, apply, onClose }: Props) {
  const source = getSource(draft.sources, sourceKey);
  const container = useDismiss(true, onClose);
  const [anchor] = useState(() => opener.getBoundingClientRect());
  const [original] = useState<SourceColor>(source);
  const gesture = useRef(0);
  const [mode, setMode] = useState<(typeof modes)[number]["value"]>("adjust");
  // The tallest the picker has been: placed by it, so switching modes does not make it jump around.
  const [height, setHeight] = useState(ESTIMATED_HEIGHT);

  // The sliders keep their own OKLCH value; a hex round trip makes the hue jump at low chroma.
  const [lch, setLch] = useState<OkLch>(() => hexToOklch(source.hex)!);
  const [shownHex, setShownHex] = useState(source.hex);
  const [hexDraft, setHexDraft] = useState(source.hex.slice(1));
  useLanguageGuard({ dirty: normalizeHex(hexDraft.trim()) !== source.hex });
  if (source.hex !== shownHex) {
    // Changed from outside the sliders ("Wie vorher", the hex field): follow it.
    setShownHex(source.hex);
    setLch(hexToOklch(source.hex)!);
    setHexDraft(source.hex.slice(1));
  }

  useEffect(() => {
    container.current?.focus();
    return () => opener.focus({ preventScroll: true });
  }, [container, opener]);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight((tallest) => Math.max(tallest, element.offsetHeight)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);

  function slide(next: OkLch) {
    const hex = oklchToHex(next);
    setLch(next);
    setShownHex(hex);
    setHexDraft(hex.slice(1));
    apply((current) => adjustColor(current, sourceKey, hex), gesture.current);
  }

  function typeHex(value: string) {
    setHexDraft(value);
    const hex = /^#?[0-9a-f]{6}$/i.test(value.trim()) ? normalizeHex(value.trim()) : null;
    if (hex && hex !== source.hex) apply((current) => adjustColor(current, sourceKey, hex), newGesture());
  }

  // Below the strip, else above it, else over it from its top edge (not over the header), always inside the window.
  const left = Math.min(Math.max(GAP, anchor.left + anchor.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - GAP);
  const top =
    anchor.bottom + GAP + height + GAP <= window.innerHeight
      ? anchor.bottom + GAP
      : anchor.top - GAP - height >= GAP
        ? anchor.top - GAP - height
        : Math.max(GAP, Math.min(anchor.top, window.innerHeight - height - GAP));
  const track = (make: (t: number) => OkLch) =>
    `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => oklchToHex(make(i / 12))).join(", ")})`;
  const startGesture = () => (gesture.current = newGesture());

  return (
    <div
      ref={container}
      role="dialog"
      aria-label={m.color_adjust_source({ name: sourceLabel(draft.sources, sourceKey) })}
      tabIndex={-1}
      style={{ left: Math.max(GAP, left), top, width: Math.min(WIDTH, window.innerWidth - 2 * GAP) }}
      className="fixed z-40 max-h-[calc(100dvh-16px)] space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-900 shadow-xl shadow-black/15 outline-none"
    >
      <div className="flex items-center gap-3">
        <span className="size-10 shrink-0 rounded-lg ring-1 ring-black/10" style={{ background: source.hex }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{sourceLabel(draft.sources, sourceKey)}</p>
          <p className="truncate text-xs text-neutral-500 tabular-nums">{formatOklch(source.hex)}</p>
        </div>
        <label className="flex items-center rounded-md border border-neutral-300 px-2 focus-within:border-neutral-900 focus-within:ring-1 focus-within:ring-neutral-900">
          <span className="text-neutral-400">#</span>
          <input
            value={hexDraft}
            onChange={(event) => typeHex(event.target.value)}
            aria-label={m.color_hex()}
            spellCheck={false}
            maxLength={7}
            className="w-16 py-1 pl-0.5 text-sm uppercase tabular-nums outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 rounded-lg bg-neutral-100 p-0.5" role="group" aria-label={m.color_choose()}>
        {modes.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              mode === value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "reference" ? (
        <ReferenceColors
          references={pool.references}
          colors={pool.colors}
          source={source}
          onTake={(hex, referenceId) => apply((current) => takeFromReference(current, sourceKey, hex, referenceId, pool.colors))}
        />
      ) : (
        <>
          <div className="space-y-3" onPointerDown={startGesture} onKeyDown={startGesture}>
            <Slider
              label={m.color_hue()}
              value={lch.h}
              max={360}
              step={1}
              display={`${Math.round(lch.h)}°`}
              track={track((t) => ({ ...lch, h: t * 360 }))}
              onChange={(h) => slide({ ...lch, h })}
            />
            <Slider
              label={m.color_saturation()}
              value={lch.C}
              max={MAX_SLIDER_CHROMA}
              step={0.001}
              display={formatNumber(lch.C, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              track={track((t) => ({ ...lch, C: t * MAX_SLIDER_CHROMA }))}
              onChange={(C) => slide({ ...lch, C })}
            />
            <Slider
              label={m.color_lightness()}
              value={lch.L}
              max={1}
              step={0.005}
              display={`${Math.round(lch.L * 100)} %`}
              track={track((t) => ({ ...lch, L: t }))}
              onChange={(L) => slide({ ...lch, L })}
            />
          </div>

          {typeof sourceKey === "number" && (
            <ExtraName
              name={draft.sources.extras[sourceKey].name}
              others={draft.sources.extras.filter((_, index) => index !== sourceKey).map((extra) => extra.name)}
              onRename={(name, nameGesture) => apply((current) => renameExtra(current, sourceKey, name), nameGesture)}
            />
          )}
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
        <div className="flex rounded-lg bg-neutral-100 p-0.5" role="group" aria-label={m.color_lock()}>
          {locks.map((lock) => (
            <button
              key={lock}
              type="button"
              title={lockHints[lock]}
              aria-pressed={source.lock === lock}
              onClick={() => apply((current) => setLock(current, sourceKey, lock))}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                source.lock === lock ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              <LockIcon lock={lock} className="size-3" />
              {lockLabels[lock]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => apply((current) => replaceSource(current, sourceKey, original))}
          disabled={source.hex === original.hex && source.lock === original.lock && source.origin === original.origin}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs whitespace-nowrap text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw aria-hidden className="size-3" />
          {m.action_restore_previous()}</button>
      </div>
      {mode === "adjust" && (
        <p className="text-xs leading-snug text-neutral-500">{m.color_adjust_lock()}</p>
      )}
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  max: number;
  step: number;
  display: string;
  track: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-xs text-neutral-500">
        {props.label}
        <span className="text-neutral-700 tabular-nums">{props.display}</span>
      </span>
      <input
        type="range"
        min={0}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        style={{ background: props.track }}
        className="h-3 w-full cursor-pointer appearance-none rounded-full ring-1 ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.45),0_1px_3px_rgba(0,0,0,.3)] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.45),0_1px_3px_rgba(0,0,0,.3)]"
      />
    </label>
  );
}

/**
 * The extra colour's scale name. Every valid name is saved as it is typed,
 * so closing the picker never loses it; one stay in the field is one undo
 * step. A bad name stays unsaved with the reason below.
 */
function ExtraName({ name, others, onRename }: { name: string; others: string[]; onRename: (name: string, gesture: number) => void }) {
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const gesture = useRef(0);

  // A suggested name that followed a new colour replaces what the field shows; the owner's own typing comes back unchanged.
  const [shownName, setShownName] = useState(name);
  if (name !== shownName) {
    setShownName(name);
    if (name !== value.trim()) {
      setValue(name);
      setProblem(null);
    }
  }

  useLanguageGuard({ dirty: value.trim() !== name });
  function change(next: string) {
    setValue(next);
    const check = checkExtraName(next.trim(), others);
    setProblem(check && nameProblems[check]);
    if (!check && next.trim() !== name) onRename(next.trim(), gesture.current);
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-neutral-500">{m.color_scale_name()}</span>
      <input
        value={value}
        onChange={(event) => change(event.target.value)}
        onFocus={() => (gesture.current = newGesture())}
        spellCheck={false}
        aria-invalid={problem !== null}
        className="block w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus:outline-none aria-invalid:border-red-600"
      />
      {problem && <span className="block text-xs text-red-700">{problem}</span>}
    </label>
  );
}
