/**
 * Scales: 11 steps (50–950) around one colour, shaped by the nearest
 * Tailwind v4 scale instead of a fixed formula (research on
 * `research/generator-algorithmus`). A fixed lightness ladder turns a
 * yellow olive in the middle; Tailwind's hand-tuned yellow drifts towards
 * brown instead, and the template carries that over.
 */

import { hexToOklch, oklchToHex, type OkLch } from "../color";
import { tailwindPalette, type TemplateStep } from "./tailwind-palette";

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];

/**
 * Below this chroma a colour reads as grey and takes a neutral template
 * (slate, stone, …). Tailwind's neutral scales top out at 0.046, a muted
 * warm grey like `#8a7a72` sits at 0.024.
 */
export const NEUTRAL_CHROMA = 0.035;

/** Signed hue difference a − b in degrees, −180..180. */
export const hueDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

const templates = Object.entries(tailwindPalette).map(([name, steps]) => ({
  name,
  steps,
  neutral: Math.max(...steps.map(([, C]) => C)) < 0.05,
}));

/** Index of the template step whose lightness is nearest to L. */
const nearestStep = (steps: readonly TemplateStep[], L: number) =>
  steps.reduce((best, [stepL], i) => (Math.abs(stepL - L) < Math.abs(steps[best]![0] - L) ? i : best), 0);

/**
 * Tailwind templates ordered by fit, best first: same kind (neutral or
 * colourful) as the colour, then nearest hue at the step nearest in
 * lightness. Neutrals also weigh chroma, their hue says little.
 */
export function rankTemplates(color: OkLch) {
  const neutral = color.C < NEUTRAL_CHROMA;
  const score = (steps: readonly TemplateStep[]) => {
    const [, C, h] = steps[nearestStep(steps, color.L)]!;
    const hue = Math.abs(hueDiff(h, color.h));
    return neutral ? Math.abs(C - color.C) * 30 + hue / 180 : hue;
  };
  return templates
    .map((t) => ({ ...t, score: (t.neutral === neutral ? 0 : 1000) + score(t.steps) }))
    .sort((a, b) => a.score - b.score);
}

export type ScaleShape = { anchorStep: Step; steps: Record<Step, string> };

/**
 * The scale of `hex`: the colour sits unchanged on the step nearest to its
 * lightness (kept between 100 and 900, so both ends have room), the other
 * steps follow the template's lightness ladder, chroma curve and hue drift.
 */
export function buildScale(hex: string): ScaleShape {
  const color = hexToOklch(hex);
  if (!color) throw new Error(`Not a hex colour: ${hex}`);
  const template = rankTemplates(color)[0]!;
  const tpl = template.steps;
  const anchor = Math.min(9, Math.max(1, nearestStep(tpl, color.L)));
  const [anchorL, anchorC, anchorH] = tpl[anchor]!;
  const lightL = tpl[0]![0];
  const darkL = tpl[10]![0];
  const chromaRatio = color.C / Math.max(anchorC, 0.004);

  const colors = tpl.map(([L, C, h], i) => {
    if (i === anchor) return hex;
    // Lightness moves with the source between the template's fixed ends.
    const mappedL =
      i < anchor
        ? lightL + ((L - lightL) * (color.L - lightL)) / (anchorL - lightL || 1)
        : darkL + ((L - darkL) * (color.L - darkL)) / (anchorL - darkL || 1);
    // Neutral templates have near-zero chroma, so the ratio can explode; cap it near the source chroma.
    const chroma = template.neutral ? Math.min(C * chromaRatio, color.C * 1.3) : C * chromaRatio;
    return oklchToHex({ L: mappedL, C: chroma, h: template.neutral ? color.h : color.h + hueDiff(h, anchorH) });
  });
  return {
    anchorStep: STEPS[anchor]!,
    steps: Object.fromEntries(STEPS.map((step, i) => [step, colors[i]!])) as Record<Step, string>,
  };
}
