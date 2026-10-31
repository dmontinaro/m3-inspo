/**
 * The colour math against culori as the oracle (devDependency only):
 * OKLCH → sRGB with the gamut clamp, and the WCAG 2 contrast ratio.
 */

import { clampChroma, formatHex, wcagContrast } from "culori";
import { describe, expect, test } from "vitest";
import { contrastRatio, hexToRgb, oklchToHex } from "./color";

/** A fixed pseudo-random sequence, so a failure always names the same colour. */
function sequence(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const random = sequence(21);
const colours = Array.from({ length: 2000 }, () => ({ L: random(), C: random() * 0.37, h: random() * 360 }));

describe("oklchToHex", () => {
  test("stays within 3/255 per channel of culori's chroma clamp, also out of gamut", () => {
    for (const { L, C, h } of colours) {
      const ours = hexToRgb(oklchToHex({ L, C, h }))!;
      const oracle = hexToRgb(formatHex(clampChroma({ mode: "oklch", l: L, c: C, h }, "oklch")))!;
      const drift = Math.max(...ours.map((v, i) => Math.abs(v - oracle[i]!)));
      expect(drift, `oklch(${L} ${C} ${h})`).toBeLessThanOrEqual(3);
    }
  });
});

describe("contrastRatio", () => {
  test("matches culori's WCAG 2 contrast", () => {
    const hexes = colours.slice(0, 200).map((c) => oklchToHex(c));
    for (let i = 1; i < hexes.length; i++) {
      expect(contrastRatio(hexes[i]!, hexes[i - 1]!)).toBeCloseTo(wcagContrast(hexes[i]!, hexes[i - 1]!), 6);
    }
  });

  test("is 21 for black on white, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 6);
  });
});
