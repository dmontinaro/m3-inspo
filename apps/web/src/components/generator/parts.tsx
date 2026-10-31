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

export const lockLabels: Record<Lock, string> = { open: "Offen", hue: "Farbton", exact: "Exakt" };

export const lockHints: Record<Lock, string> = {
  open: "Offen: Würfeln ändert die Farbe",
  hue: "Farbton gesperrt: Würfeln ändert nur Helligkeit und Sättigung",
  exact: "Exakt gesperrt: Würfeln behält die Farbe",
};

export function LockIcon({ lock, className = "size-3.5" }: { lock: Lock; className?: string }) {
  const Icon = lock === "open" ? LockOpen : lock === "hue" ? Palette : LockClosed;
  return <Icon aria-hidden className={className} strokeWidth={2} />;
}

/** "Marke", "Neutral" or the extra colour's name. */
export const sourceLabel = (sources: ColorSources, key: SourceKey) =>
  key === "brand" ? "Marke" : key === "neutral" ? "Neutral" : (sources.extras[key]?.name ?? "");

/** Where a source colour comes from, in a few words. */
export function describeOrigin(origin: SourceOrigin, references: ReadonlyMap<string, GeneratorReference>): string {
  if (origin.kind === "manual") return "Von Hand";
  if (origin.kind === "rolled") return "Gewürfelt";
  const title = origin.referenceId ? references.get(origin.referenceId)?.title : undefined;
  if (origin.measuredBy === "image") return title ? `Pipette in „${title}“` : "Pipette in gelöschter Referenz";
  return title ? `Aus „${title}“` : "Aus gelöschter Referenz";
}

/** `4.62` → "4,62 : 1" */
export const formatRatio = (ratio: number) => `${ratio.toFixed(2).replace(".", ",")} : 1`;

/** A WCAG 2 ratio against its minimum: quiet when it passes, red when it does not. Never blocks anything. */
export function ContrastBadge({ ratio, min }: { ratio: number; min: number }) {
  const pass = ratio >= min;
  return (
    <span
      title={pass ? `Erfüllt ${formatRatio(min)}` : `Nötig sind ${formatRatio(min)}`}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        pass ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
      }`}
    >
      {formatRatio(ratio)}
    </span>
  );
}
