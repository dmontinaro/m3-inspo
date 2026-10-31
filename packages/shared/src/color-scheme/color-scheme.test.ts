/**
 * The generator core as pure functions: colour sources in, scales, roles,
 * warnings, CSS and the generator URL out. Cases follow the spec (#44),
 * Harbor first.
 */

import { describe, expect, test } from "vitest";
import { colorDistanceHex, contrastRatio, formatOklch, hexToOklch } from "../color";
import {
  ROLE_NAMES,
  STEPS,
  buildColorScheme,
  buildDarkRoles,
  checkExtraName,
  exportCss,
  parseGeneratorSearch,
  serializeGeneratorSearch,
  suggestExtraName,
  type ColorSchemeSnapshot,
  type ColorSources,
  type GeneratorState,
  type Lock,
  type SourceColor,
} from "./index";

const exact = (hex: string, lock: Lock = "exact"): SourceColor => ({ hex, lock, origin: { kind: "manual" } });

const warmNeutral = exact("#8a7a72");

function scheme(brand: SourceColor, primary: "vivid" | "hold" = "vivid", extras: ColorSources["extras"] = []) {
  return buildColorScheme({ brand, neutral: warmNeutral, extras }, primary);
}

const scale = (snapshot: ColorSchemeSnapshot, name: string) => snapshot.scales.find((s) => s.name === name)!;

/** Signed hue difference in degrees, -180..180. */
const hueDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

describe("Harbor: orange brand, hue locked, vivid primary", () => {
  const snapshot = scheme(exact("#e56236", "hue"));

  test("primary keeps the brand hue and carries white text at 4.5:1, near #d54400", () => {
    const { primary } = snapshot.roles;
    expect(contrastRatio(primary.hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(hueDiff(hexToOklch(primary.hex)!.h, hexToOklch("#e56236")!.h))).toBeLessThan(3);
    expect(colorDistanceHex(primary.hex, "#d54400")).toBeLessThan(0.02);
    expect(primary.derivation).toBe("Marke, abgedunkelt");
    expect(snapshot.roles["primary-foreground"]).toMatchObject({ hex: "#ffffff", contrast: { against: "primary", min: 4.5 } });
  });

  test("the brand scale keeps the real orange exactly on its anchor step", () => {
    const brand = scale(snapshot, "brand");
    expect(brand.steps[brand.anchorStep]).toBe("#e56236");
    expect(Object.keys(brand.steps).map(Number)).toEqual([...STEPS]);
  });
});

describe("contrast pairs", () => {
  test.each([
    ["yellow", "#f4d35e"],
    ["orange", "#e56236"],
    ["violet", "#6b4eff"],
    ["grey", "#6b7280"],
  ])("hold for a %s brand", (_, hex) => {
    const snapshot = scheme(exact(hex));
    expect(snapshot.warnings).toEqual([]);
    const paired = ROLE_NAMES.map((name) => snapshot.roles[name]).filter((role) => role.contrast);
    expect(paired).toHaveLength(6);
    for (const role of paired) expect(role.contrast!.ratio).toBeGreaterThanOrEqual(role.contrast!.min);
  });

  test("an edge case the rules cannot fix is a warning, not an error", () => {
    // A mid yellow held as is: neither white nor the darkest neutral reaches 4.5:1 on it.
    const snapshot = scheme(exact("#8d7600"), "hold");
    expect(snapshot.roles.primary.hex).toBe("#8d7600");
    expect(snapshot.warnings).toContainEqual({ role: "primary-foreground", message: expect.stringMatching(/primary/) });
  });

  test("a very dark neutral still gives readable text on the page", () => {
    const snapshot = buildColorScheme({ brand: exact("#e56236"), neutral: exact("#1a1a1a"), extras: [] }, "vivid");
    expect(contrastRatio(snapshot.roles.foreground.hex, snapshot.roles.background.hex)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("destructive", () => {
  test("keeps ΔE_OK 0.12 from an orange primary, or says it cannot", () => {
    const snapshot = scheme(exact("#e56236", "hue"));
    const distance = colorDistanceHex(snapshot.roles.destructive.hex, snapshot.roles.primary.hex);
    const warned = snapshot.warnings.some((w) => w.role === "destructive");
    expect(distance >= 0.12 || warned).toBe(true);
    expect(contrastRatio(snapshot.roles.destructive.hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  test("warns when a red brand leaves no distinct red", () => {
    const snapshot = scheme(exact("#d0312d"));
    const distance = colorDistanceHex(snapshot.roles.destructive.hex, snapshot.roles.primary.hex);
    if (distance < 0.12) expect(snapshot.warnings.map((w) => w.role)).toContain("destructive");
  });
});

describe("scales", () => {
  test("a yellow scale stays yellow instead of turning olive", () => {
    const yellow = scale(scheme(exact("#f4d35e")), "brand");
    expect(yellow.steps[yellow.anchorStep]).toBe("#f4d35e");
    for (const step of STEPS) {
      const { h, C } = hexToOklch(yellow.steps[step])!;
      if (step >= 200) expect(h, `yellow-${step}`).toBeGreaterThan(40);
      if (step >= 200) expect(h, `yellow-${step}`).toBeLessThan(105);
      if (step >= 300 && step <= 600) expect(C, `yellow-${step}`).toBeGreaterThan(0.1);
    }
  });

  test("every source has a scale, plus danger derived from the brand", () => {
    const snapshot = scheme(exact("#e56236"), "vivid", [{ ...exact("#2f7d6d"), name: "teal" }]);
    expect(snapshot.scales.map((s) => s.name)).toEqual(["brand", "neutral", "teal", "danger"]);
    expect(scale(snapshot, "teal").steps[scale(snapshot, "teal").anchorStep]).toBe("#2f7d6d");
  });

  test("the same sources always give the same snapshot", () => {
    expect(scheme(exact("#6b4eff"))).toEqual(scheme(exact("#6b4eff")));
  });
});

describe("roles", () => {
  test("follow the spec's table for a plain brand", () => {
    const snapshot = scheme(exact("#6b4eff"));
    const neutral = scale(snapshot, "neutral");
    expect(snapshot.roles.background).toMatchObject({ hex: neutral.steps[50], derivation: "neutral-50" });
    expect(snapshot.roles.foreground).toMatchObject({ hex: neutral.steps[950], derivation: "neutral-950" });
    expect(snapshot.roles.card).toMatchObject({ hex: "#ffffff", derivation: "Weiß" });
    expect(snapshot.roles["card-foreground"].hex).toBe(snapshot.roles.foreground.hex);
    expect(snapshot.roles.muted).toMatchObject({ hex: neutral.steps[100], derivation: "neutral-100" });
    expect(snapshot.roles.border).toMatchObject({ hex: neutral.steps[200], derivation: "neutral-200" });
    expect(snapshot.roles["muted-foreground"].derivation).toMatch(/^neutral-(400|500|600|700|800|900|950)$/);
    expect(snapshot.roles.ring.derivation).toMatch(/^brand-\d+$/);
    expect(snapshot.roles.destructive.derivation).toMatch(/^danger-\d+$/);
  });

  test("hold keeps the brand colour as primary and adapts the text", () => {
    const snapshot = scheme(exact("#f4d35e"), "hold");
    expect(snapshot.roles.primary.hex).toBe("#f4d35e");
    expect(snapshot.roles["primary-foreground"].derivation).toBe("neutral-950");
  });
});

describe("export", () => {
  const snapshot = scheme(exact("#e56236", "hue"), "vivid", [{ ...exact("#2f7d6d"), name: "teal" }]);
  const css = exportCss(snapshot);

  test("declares every role and scale step in oklch() in :root", () => {
    const root = css.slice(0, css.indexOf(".dark {"));
    for (const role of ROLE_NAMES) expect(root).toMatch(new RegExp(`\\n  --${role}: oklch\\([^)]+\\);`));
    for (const { name } of snapshot.scales)
      for (const step of STEPS) expect(root).toMatch(new RegExp(`\\n  --${name}-${step}: oklch\\([^)]+\\);`));
    expect(root).not.toMatch(/#[0-9a-f]{6}/);
  });

  test("adds the shadcn references and maps everything into @theme inline", () => {
    for (const [role, target] of [
      ["popover", "card"],
      ["popover-foreground", "card-foreground"],
      ["secondary", "muted"],
      ["secondary-foreground", "foreground"],
      ["accent", "muted"],
      ["accent-foreground", "foreground"],
      ["input", "border"],
    ])
      expect(css).toContain(`  --${role}: var(--${target});`);
    const theme = css.slice(css.indexOf("@theme inline"));
    for (const role of [...ROLE_NAMES, "popover", "accent", "input"]) expect(theme).toContain(`  --color-${role}: var(--${role});`);
    expect(theme).toContain("  --color-teal-950: var(--teal-950);");
    expect(css).not.toContain("initial");
  });

  test("repeats the roles and shadcn references with their dark values in .dark", () => {
    const dark = css.slice(css.indexOf(".dark {"), css.indexOf("@theme inline"));
    expect(dark).toContain(`  --background: ${formatOklch(buildDarkRoles(snapshot).roles.background.hex)};`);
    expect(dark).toContain("  --popover: var(--card);");
    expect(dark).not.toContain("--brand-");
  });

  test("as plain CSS is the :root and .dark blocks alone", () => {
    expect(exportCss(snapshot, "css")).toBe(css.slice(0, css.indexOf("\n@theme inline")));
  });
});

describe("extra colour names", () => {
  test("are suggested from the nearest Tailwind template, the next free one on a clash", () => {
    expect(suggestExtraName("#2f7d6d", [])).toBe("teal");
    expect(suggestExtraName("#2f7d6d", ["teal"])).not.toBe("teal");
    expect(suggestExtraName("#3b82f6", [])).toBe("blue");
  });

  test("reject reserved, taken and malformed names", () => {
    for (const name of ["brand", "neutral", "danger", "primary", "muted-foreground", "accent"])
      expect(checkExtraName(name, []), name).toBe("reserved");
    expect(checkExtraName("teal", ["teal"])).toBe("taken");
    for (const name of ["Teal", "teal2", "", "te al", "-teal"]) expect(checkExtraName(name, []), name).toBe("invalid");
    expect(checkExtraName("salbei", ["teal"])).toBeNull();
  });
});

describe("generator URL", () => {
  const state: GeneratorState = {
    brand: { hex: "#e56236", lock: "hue", reference: "harbor-app" },
    neutral: { hex: "#8a7a72", lock: "open" },
    extras: [
      { name: "teal", hex: "#2f7d6d", lock: "exact" },
      { hex: "#c8a97e", lock: "open" },
    ],
    primary: "hold",
    seed: 1234567,
    pool: { kind: "project", tag: "harbor" },
  };

  test("writes readable parameters and reads the same state back", () => {
    const search = serializeGeneratorSearch(state);
    expect(search).toBe(
      "brand=e56236~hue@harbor-app&neutral=8a7a72&extras=teal:2f7d6d~exact,c8a97e&primary=hold&seed=1234567&pool=project:harbor",
    );
    expect(parseGeneratorSearch(Object.fromEntries(new URLSearchParams(search)))).toEqual({ state, skipped: [] });
  });

  test("leaves the defaults out", () => {
    const search = serializeGeneratorSearch({ ...state, extras: [], primary: "vivid", seed: null, pool: { kind: "all" } });
    expect(search).toBe("brand=e56236~hue@harbor-app&neutral=8a7a72");
  });

  test("reads every pool form", () => {
    const pool = (value: string) => parseGeneratorSearch({ pool: value }).state.pool;
    expect(pool("all")).toEqual({ kind: "all" });
    expect(pool("collection:quiet-hotels")).toEqual({ kind: "collection", slug: "quiet-hotels" });
    expect(pool("fjord-lodge,salt-and-rye")).toEqual({ kind: "references", slugs: ["fjord-lodge", "salt-and-rye"] });
  });

  test("tolerates broken tokens and reports what it skipped", () => {
    const { state: read, skipped } = parseGeneratorSearch({
      brand: "zzzzzz~hue",
      neutral: "8a7a72~sideways",
      extras: "teal:2f7d6d,brand:c8a97e,,6b4eff",
      primary: "loud",
      seed: "abc",
      pool: "project:",
    });
    expect(read).toEqual({
      brand: null,
      neutral: { hex: "#8a7a72", lock: "open" },
      extras: [
        { name: "teal", hex: "#2f7d6d", lock: "open" },
        { hex: "#c8a97e", lock: "open" },
        { hex: "#6b4eff", lock: "open" },
      ],
      primary: "vivid",
      seed: null,
      pool: { kind: "all" },
    });
    expect(skipped).toEqual([
      { param: "brand", value: "zzzzzz~hue" },
      { param: "neutral", value: "8a7a72~sideways" },
      { param: "extras", value: "brand:c8a97e" },
      { param: "primary", value: "loud" },
      { param: "seed", value: "abc" },
      { param: "pool", value: "project:" },
    ]);
  });

  test("keeps at most five extras", () => {
    const { state: read, skipped } = parseGeneratorSearch({ extras: "111111,222222,333333,444444,555555,666666" });
    expect(read.extras).toHaveLength(5);
    expect(skipped).toEqual([{ param: "extras", value: "666666" }]);
  });

  test("accepts a seed the router already parsed as a number", () => {
    expect(parseGeneratorSearch({ seed: 99 }).state.seed).toBe(99);
  });
});

describe("dark roles", () => {
  test.each([
    ["yellow", "#f4d35e"],
    ["orange", "#e56236"],
    ["navy", "#1e2a5a"],
    ["teal", "#0f766e"],
  ])("%s: every pair meets its minimum on the dark surfaces", (_, hex) => {
    const dark = buildDarkRoles(scheme(exact(hex)));
    expect(dark.warnings).toEqual([]);
    expect(contrastRatio(dark.roles.background.hex, "#000000")).toBeLessThan(1.5);
  });

  test("the vivid orange stays primary, white text and all", () => {
    const snapshot = scheme(exact("#e56236", "hue"));
    const dark = buildDarkRoles(snapshot);
    expect(dark.roles.primary.hex).toBe(snapshot.roles.primary.hex);
    expect(dark.roles["primary-foreground"].hex).toBe("#ffffff");
  });

  test("a navy brand lightens along its scale until it stands out from the page", () => {
    const snapshot = scheme(exact("#1e2a5a"));
    const dark = buildDarkRoles(snapshot);
    expect(dark.roles.primary.derivation).toMatch(/^brand-\d+$/);
    expect(contrastRatio(dark.roles.primary.hex, dark.roles.background.hex)).toBeGreaterThanOrEqual(3);
  });
});
