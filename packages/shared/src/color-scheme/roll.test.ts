/**
 * Rolling source colours from the pool (spec #44, "Würfeln"): kinds, locks,
 * distances, the contrast check, the harmony fallback for a single-hue pool
 * and the free roll without a pool. Same seed, same result.
 */

import { describe, expect, test } from "vitest";
import { colorDistanceHex, hexToOklch } from "../color";
import {
  NEUTRAL_CHROMA,
  buildColorScheme,
  completeSources,
  rollSources,
  type ColorSources,
  type Lock,
  type PoolColor,
  type SourceColor,
} from "./index";

const manual = (hex: string, lock: Lock = "exact"): SourceColor => ({ hex, lock, origin: { kind: "manual" } });

const color = (hex: string, referenceId: string, measuredBy: PoolColor["measuredBy"] = "dom"): PoolColor => ({ hex, referenceId, measuredBy });

/** Two references: a warm hotel site and a cool SaaS page, each with white, black, greys and colours. */
const pool: PoolColor[] = [
  color("#ffffff", "hotel"),
  color("#e56236", "hotel"),
  color("#c8a97e", "hotel"),
  color("#8a7a72", "hotel"),
  color("#f7f1e8", "hotel"),
  color("#000000", "saas", "vision"),
  color("#6b4eff", "saas", "vision"),
  color("#2f7d6d", "saas", "vision"),
  color("#1c2b33", "saas", "vision"),
  color("#d9822b", "saas", "vision"),
];
const colourful = ["#e56236", "#c8a97e", "#6b4eff", "#2f7d6d", "#d9822b"];
const greys = ["#8a7a72", "#f7f1e8", "#1c2b33"];

const seeds = Array.from({ length: 25 }, (_, i) => i + 1);
const chroma = (hex: string) => hexToOklch(hex)!.C;
const hue = (hex: string) => hexToOklch(hex)!.h;
const hueDistance = (a: string, b: string) => Math.abs(((((hue(a) - hue(b)) % 360) + 540) % 360) - 180);

/** Brand, neutral and `extras` open extras, all rolled from `pool` with `seed`. */
function rollAll(seed: number, extras = 0, rollPool = pool): ColorSources {
  const open = { hex: "#808080", lock: "open" as const, origin: { kind: "manual" as const } };
  const sources = { brand: open, neutral: open, extras: Array.from({ length: extras }, (_, i) => ({ ...open, name: `extra-${"abcde"[i]}` })) };
  return rollSources(sources, { pool: rollPool, seed, primary: "vivid" });
}

describe("rolling from the pool", () => {
  test("brand and extras come from colourful pool colours, the neutral from grey ones, never white or black", () => {
    for (const seed of seeds) {
      const { brand, neutral, extras } = rollAll(seed, 1);
      expect(colourful, `seed ${seed}`).toContain(brand.hex);
      expect(greys, `seed ${seed}`).toContain(neutral.hex);
      for (const extra of extras) expect(chroma(extra.hex)).toBeGreaterThanOrEqual(NEUTRAL_CHROMA);
      for (const hex of [brand.hex, neutral.hex, ...extras.map((e) => e.hex)]) expect(["#ffffff", "#000000"]).not.toContain(hex);
    }
  });

  test("a colour taken from the pool names its reference, how it was measured and the seed", () => {
    const { brand } = rollAll(3);
    const taken = pool.find((c) => c.hex === brand.hex)!;
    expect(brand).toEqual({
      hex: taken.hex,
      lock: "open",
      origin: { kind: "reference", referenceId: taken.referenceId, measuredBy: taken.measuredBy, seed: 3 },
    });
  });

  test("the same seed, pool and sources give the same result; other seeds vary", () => {
    expect(rollAll(42, 2)).toEqual(rollAll(42, 2));
    expect(new Set(seeds.map((seed) => rollAll(seed).brand.hex)).size).toBeGreaterThan(2);
  });

  test("a small pool still varies from seed to seed: colours about to roll do not hold the others in place", () => {
    const small = [color("#e56236", "one"), color("#6b4eff", "one"), color("#2f7d6d", "one"), color("#8a7a72", "one")];
    // The space bar rolls again from the last result, not from blank colours.
    const last = rollAll(1, 2, small);
    const next = new Set(seeds.map((seed) => rollSources(last, { pool: small, seed, primary: "vivid" }).brand.hex));
    expect(next.size).toBeGreaterThan(1);
  });

  test("rolled colours keep their distance from each other, extras also in hue", () => {
    for (const seed of seeds) {
      const { brand, neutral, extras } = rollAll(seed, 2);
      const all = [brand.hex, neutral.hex, ...extras.map((e) => e.hex)];
      for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) expect(colorDistanceHex(a, b)).toBeGreaterThanOrEqual(0.08);
      for (const [i, extra] of extras.entries()) {
        expect(hueDistance(extra.hex, brand.hex), `seed ${seed}`).toBeGreaterThanOrEqual(30);
        for (const other of extras.slice(i + 1)) expect(hueDistance(extra.hex, other.hex)).toBeGreaterThanOrEqual(30);
      }
    }
  });

  test("a single-hue pool still gives extras their own hue, from a harmony rule with the pool's lightness and chroma", () => {
    const oranges = [color("#e56236", "orange"), color("#c2410c", "orange"), color("#fdba74", "orange"), color("#8a7a72", "orange")];
    const poolLightness = oranges.map((c) => hexToOklch(c.hex)!.L);
    for (const seed of seeds.slice(0, 10)) {
      const { brand, extras } = rollAll(seed, 2, oranges);
      expect(brand.origin.kind).toBe("reference");
      for (const extra of extras) {
        expect(hueDistance(extra.hex, brand.hex)).toBeGreaterThanOrEqual(30);
        expect(Math.min(...poolLightness.map((L) => Math.abs(L - hexToOklch(extra.hex)!.L)))).toBeLessThan(0.01);
        expect(extra.origin).toEqual({ kind: "rolled", seed });
      }
    }
  });

  test("a candidate whose primary would miss its contrast loses to one that keeps it", () => {
    // Held as is, a mid yellow carries neither white nor the darkest neutral at 4.5:1.
    const yellowAndViolet = [color("#8d7600", "a"), color("#6b4eff", "b"), color("#8a7a72", "c")];
    for (const seed of seeds.slice(0, 10)) {
      const sources = completeSources({ extras: [] }, { pool: yellowAndViolet, seed, primary: "hold" });
      expect(sources.brand.hex).toBe("#6b4eff");
      expect(buildColorScheme(sources, "hold").warnings).toEqual([]);
    }
  });
});

describe("locks", () => {
  test("a hue-locked brand keeps its hue and takes lightness and chroma from the pool; an exact one stays", () => {
    const neutral = manual("#8a7a72");
    for (const seed of seeds.slice(0, 10)) {
      const rolled = rollSources({ brand: manual("#e56236", "hue"), neutral, extras: [] }, { pool, seed, primary: "vivid" });
      expect(Math.abs(hue(rolled.brand.hex) - hue("#e56236"))).toBeLessThan(2);
      expect(rolled.brand.lock).toBe("hue");
      expect(rolled.neutral).toBe(neutral);
    }
  });

  test("`only` rolls just that source", () => {
    const sources: ColorSources = { brand: manual("#e56236", "open"), neutral: manual("#8a7a72", "open"), extras: [{ ...manual("#808080", "open"), name: "new" }] };
    const rolled = rollSources(sources, { pool, seed: 9, primary: "vivid", only: 0 });
    expect(rolled.brand).toBe(sources.brand);
    expect(rolled.neutral).toBe(sources.neutral);
    expect(rolled.extras[0]).toMatchObject({ name: "new", lock: "open" });
    expect(colourful).toContain(rolled.extras[0]!.hex);
  });
});

describe("completeSources", () => {
  test("rolls only what is missing; given colours stay, a hue lock included", () => {
    const brand = manual("#e56236", "hue");
    const sources = completeSources({ brand, extras: [] }, { pool, seed: 42, primary: "vivid" });
    expect(sources.brand).toBe(brand);
    expect(greys).toContain(sources.neutral.hex);
    expect(sources.neutral.origin).toMatchObject({ kind: "reference", seed: 42 });
  });

  test("without colours in the pool it rolls freely: origin `rolled` with the seed, no reference", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { brand, neutral } = completeSources({ extras: [] }, { pool: [], seed, primary: "vivid" });
      expect(brand.origin).toEqual({ kind: "rolled", seed });
      expect(neutral.origin).toEqual({ kind: "rolled", seed });
      expect(chroma(brand.hex)).toBeGreaterThanOrEqual(NEUTRAL_CHROMA);
      expect(chroma(neutral.hex)).toBeLessThan(NEUTRAL_CHROMA);
      expect(colorDistanceHex(brand.hex, neutral.hex)).toBeGreaterThan(0.08);
    }
    expect(completeSources({ extras: [] }, { pool: [], seed: 7, primary: "vivid" })).toEqual(
      completeSources({ extras: [] }, { pool: [], seed: 7, primary: "vivid" }),
    );
  });
});
