import { formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
/** Small pieces the generator's strips, picker and preview share. */

import { Lock as LockClosed, LockOpen, Palette } from "lucide-react";
import { contrastRatio } from "@m3-inspo/shared";
import type { ColorSources, Lock, SourceKey, SourceOrigin } from "@m3-inspo/shared/color-scheme";
import type { GeneratorReference } from "#/lib/generator";

/**
 * Readable text on a colour: white or black, whichever contrasts more. With
 * pure black one of the two always reaches 4.58 : 1; a softer near-black
 * drops to 4.2 : 1 on some mid tones.
 */
export const inkOn = (hex: string) => (contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#000000") ? "#ffffff" : "#000000");

export const lockLabels: Record<Lock, string> = { get open() { return m.lock_open(); }, get hue() { return m.color_hue(); }, get exact() { return m.lock_exact(); } };

export const lockHints: Record<Lock, string> = {
  get open() { return m.lock_open_help(); },
  get hue() { return m.lock_hue_help(); },
  get exact() { return m.lock_exact_help(); },
};

export function LockIcon({ lock, className = "size-3.5" }: { lock: Lock; className?: string }) {
  const Icon = lock === "open" ? LockOpen : lock === "hue" ? Palette : LockClosed;
  return <Icon aria-hidden className={className} strokeWidth={2} />;
}

/** "Marke", "Neutral" or the extra colour's name. */
export const sourceLabel = (sources: ColorSources, key: SourceKey) =>
  key === "brand" ? m.source_brand() : key === "neutral" ? m.source_neutral() : (sources.extras[key]?.name ?? "");

/** Where a source colour comes from, in a few words. */
export function describeOrigin(origin: SourceOrigin, references: ReadonlyMap<string, GeneratorReference>): string {
  if (origin.kind === "manual") return m.source_manual();
  if (origin.kind === "rolled") return m.source_rolled();
  const title = origin.referenceId ? references.get(origin.referenceId)?.title : undefined;
  if (origin.measuredBy === "image") return title ? m.source_eyedropper_title({ title }) : m.source_deleted_eyedropper();
  return title ? m.source_reference_title({ title }) : m.source_deleted_reference();
}

/** `4.62` → "4,62 : 1" */
export const formatRatio = (ratio: number) => `${formatNumber(ratio, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} : 1`;

/** A WCAG 2 ratio against its minimum: quiet when it passes, red when it does not. Never blocks anything. */
export function ContrastBadge({ ratio, min }: { ratio: number; min: number }) {
  const pass = ratio >= min;
  return (
    <span
      title={pass ? m.contrast_pass({ ratio: formatRatio(min) }) : m.contrast_required({ ratio: formatRatio(min) })}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        pass ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
      }`}
    >
      {formatRatio(ratio)}
    </span>
  );
}
