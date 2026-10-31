/**
 * Building a Color Scheme: source colours and the `primary` strategy in,
 * snapshot out (scales, 11 shadcn roles, contrast values, warnings). Pure
 * and deterministic. Rules and tables: spec #44, sections "Skalen" and
 * "Rollen".
 */

import { colorDistanceHex, contrastRatio, hexToOklch, maxChroma, oklchToHex } from "../color";
import { STEPS, buildScale, rankTemplates, type Step } from "./scale";

export type Lock = "open" | "hue" | "exact";

export type SourceOrigin =
  // Taken from a reference: from its measured palette (dom / vision) or by pipette (image).
  // referenceId is null once the reference is deleted. seed is set when the colour was rolled.
  | { kind: "reference"; referenceId: string | null; measuredBy: "dom" | "vision" | "image"; seed?: number }
  | { kind: "rolled"; seed: number } // rolled, but no reference's colour: a free roll, a harmony hue, or moved by a hue lock
  | { kind: "manual" }; // set by hand (or by an agent)

export type SourceColor = { hex: string; lock: Lock; origin: SourceOrigin };
export type ExtraColor = SourceColor & { name: string };

/** Brand and neutral always; 0–5 extra colours, each with its own scale and no role. */
export type ColorSources = { brand: SourceColor; neutral: SourceColor; extras: ExtraColor[] };

export const MAX_EXTRAS = 5;

/**
 * How `primary` treats a brand colour that fails 4.5:1 with white text.
 * vivid: same hue, just dark enough, as saturated as sRGB allows.
 * hold: the brand colour as is; the text on it adapts.
 */
export type PrimaryStrategy = "vivid" | "hold";

export const ROLE_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "muted",
  "muted-foreground",
  "border",
  "ring",
  "destructive",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export type Scale = { name: string; anchorStep: Step; steps: Record<Step, string> };

export type Role = {
  hex: string;
  /** Readable origin of the value: `neutral-100`, "Marke, abgedunkelt", "Weiß". */
  derivation: string;
  /** The role's WCAG 2 ratio against its counterpart, rounded down to 2 decimals. */
  contrast?: { against: RoleName | "white"; ratio: number; min: number };
};

export type SchemeWarning = { role: RoleName; message: string };

export type ColorSchemeSnapshot = {
  /** brand, neutral, the extras in order, then danger. */
  scales: Scale[];
  roles: Record<RoleName, Role>;
  warnings: SchemeWarning[];
};

/** What a Brand Kit stores: the sources, the strategy and the snapshot built from them. */
export type ColorScheme = { sources: ColorSources; primary: PrimaryStrategy; snapshot: ColorSchemeSnapshot };

const WHITE = "#ffffff";

/** The surface each role is read against, with the WCAG 2 minimum. */
const CONTRAST_PAIRS: Partial<Record<RoleName, { against: RoleName | "white"; min: number }>> = {
  foreground: { against: "background", min: 4.5 },
  "card-foreground": { against: "card", min: 4.5 },
  "primary-foreground": { against: "primary", min: 4.5 },
  "muted-foreground": { against: "muted", min: 4.5 },
  ring: { against: "background", min: 3 },
  destructive: { against: "white", min: 4.5 },
};

/** Least ΔE_OK between `destructive` and `primary`, so an error never reads as the main action. */
const MIN_DANGER_DISTANCE = 0.12;

/**
 * The first step from `from` on, towards 950 (or towards 50 when
 * `lighter`), that reaches `min` against every surface; the last step
 * that way when none does.
 */
function firstStep(scale: Scale, from: Step, against: string[], min: number, lighter = false): Step {
  const way = lighter ? STEPS.slice(0, STEPS.indexOf(from) + 1).reverse() : STEPS.slice(STEPS.indexOf(from));
  const step = way.find((s) => against.every((bg) => contrastRatio(scale.steps[s], bg) >= min));
  return step ?? way.at(-1)!;
}

/**
 * `vivid` primary: the brand's hue, darkened only until white text reaches
 * 4.5:1, at the most chroma sRGB allows (capped at 1.2× the brand's, so a
 * grey brand stays grey). Null when the brand already carries white text.
 */
function vividPrimary(brand: string): string | null {
  if (contrastRatio(brand, WHITE) >= 4.5) return null;
  const { L, C, h } = hexToOklch(brand)!;
  for (let l = L; l > 0.15; l -= 0.002) {
    const candidate = oklchToHex({ L: l, C: Math.min(maxChroma(l, h), C * 1.2), h });
    if (contrastRatio(candidate, WHITE) >= 4.5) return candidate;
  }
  return null;
}

/**
 * The signal scale and `destructive` on it: red at hue 27°, the first step
 * from 500 on with white text at 4.5:1. When that sits too close to
 * `primary` (an orange or red brand), the red moves towards 10° first,
 * then one or two steps darker, until ΔE_OK ≥ 0.12. Failing that, the
 * most distinct try wins and `distinct` is false.
 */
function signalRed(primary: string) {
  let best: { scale: Scale; step: Step; distance: number } | null = null;
  for (const darker of [0, 1, 2]) {
    for (const h of [27, 22, 17, 12]) {
      const scale = { name: "danger", ...buildScale(oklchToHex({ L: 0.58, C: 0.22, h })) };
      const passing = firstStep(scale, 500, [WHITE], 4.5);
      const step = STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(passing) + darker)]!;
      const distance = colorDistanceHex(scale.steps[step], primary);
      if (distance >= MIN_DANGER_DISTANCE) return { scale, step, distance, distinct: true };
      if (!best || distance > best.distance) best = { scale, step, distance };
    }
  }
  return { ...best!, distinct: false };
}

export type SchemeDiagnostic =
  | { kind: "contrast"; role: RoleName; against: RoleName | "white"; ratio: number; min: number }
  | { kind: "danger_distance"; role: "destructive"; distance: number; min: number };
export type RoleOrigin = { kind: "scale"; name: string; step: Step } | { kind: "white" } | { kind: "darkened_brand" };

const formatRatio = (ratio: number) => ratio.toFixed(2).replace(".", ",");

/** Each role with its contrast against its counterpart; every pair that misses its minimum is a warning. */
function rateRoles(values: Record<RoleName, Role>, diagnostics: SchemeDiagnostic[] = []): { roles: Record<RoleName, Role>; warnings: SchemeWarning[] } {
  const warnings: SchemeWarning[] = [];
  const roles = Object.fromEntries(
    ROLE_NAMES.map((name) => {
      const pair = CONTRAST_PAIRS[name];
      if (!pair) return [name, values[name]];
      const ratio = contrastRatio(values[name].hex, pair.against === "white" ? WHITE : values[pair.against].hex);
      if (ratio < pair.min) {
        diagnostics.push({ kind: "contrast", role: name, against: pair.against, ratio, min: pair.min });
        warnings.push({
          role: name,
          message: `${name} auf ${pair.against}: ${formatRatio(ratio)} : 1, nötig ${formatRatio(pair.min)} : 1`,
        });
      }
      return [name, { ...values[name], contrast: { against: pair.against, ratio: Math.floor(ratio * 100) / 100, min: pair.min } }];
    }),
  ) as Record<RoleName, Role>;
  return { roles, warnings };
}

/** Scales, roles and warnings for these sources. Every pair that misses its minimum is a warning, never an error. */
export function calculateColorScheme(sources: ColorSources, primary: PrimaryStrategy) {
  const diagnostics: SchemeDiagnostic[] = [];
  const origins = new Map<Role, RoleOrigin>();
  const brand: Scale = { name: "brand", ...buildScale(sources.brand.hex) };
  const neutral: Scale = { name: "neutral", ...buildScale(sources.neutral.hex) };
  const extras: Scale[] = sources.extras.map((extra) => ({ name: extra.name, ...buildScale(extra.hex) }));
  const at = (scale: Scale, step: Step): Role => {
    const value = { hex: scale.steps[step], derivation: `${scale.name}-${step}` };
    origins.set(value, { kind: "scale", name: scale.name, step });
    return value;
  };

  const background = at(neutral, 50);
  const muted = at(neutral, 100);
  const brandRole = at(brand, brand.anchorStep);
  const vivid = primary === "vivid" ? vividPrimary(sources.brand.hex) : null;
  const primaryRole = vivid ? { hex: vivid, derivation: "Marke, abgedunkelt" } : brandRole;
  if (vivid) origins.set(primaryRole, { kind: "darkened_brand" });
  const darkest = at(neutral, 950);
  const white = { hex: WHITE, derivation: "Weiß" };
  origins.set(white, { kind: "white" });
  const onPrimary =
    contrastRatio(primaryRole.hex, WHITE) >= 4.5 || contrastRatio(primaryRole.hex, WHITE) >= contrastRatio(primaryRole.hex, darkest.hex)
      ? white
      : darkest;
  const danger = signalRed(primaryRole.hex);

  const values: Record<RoleName, Role> = {
    background,
    foreground: darkest,
    card: white,
    "card-foreground": darkest,
    muted,
    "muted-foreground": at(neutral, firstStep(neutral, 400, [muted.hex, background.hex], 4.5)),
    border: at(neutral, 200),
    primary: primaryRole,
    "primary-foreground": onPrimary,
    // UI contrast (3:1) against the page, starting at the brand colour itself.
    ring: at(brand, firstStep(brand, brand.anchorStep, [background.hex], 3)),
    destructive: at(danger.scale, danger.step),
  };

  const { roles, warnings } = rateRoles(values, diagnostics);
  if (!danger.distinct) {
    diagnostics.push({ kind: "danger_distance", role: "destructive", distance: danger.distance, min: MIN_DANGER_DISTANCE });
    warnings.push({
      role: "destructive",
      message: `destructive ist kaum von primary zu unterscheiden: ΔE_OK ${danger.distance.toFixed(2).replace(".", ",")}, nötig ${formatRatio(MIN_DANGER_DISTANCE)}`,
    });

  }
  const roleOrigins = Object.fromEntries(ROLE_NAMES.map((role) => [role, origins.get(values[role])]));
  return { snapshot: { scales: [brand, neutral, ...extras, danger.scale], roles, warnings }, diagnostics, roleOrigins };
}

/** Existing persisted/MCP snapshots retain exactly their original fields and diagnostics. */
export function buildColorScheme(sources: ColorSources, primary: PrimaryStrategy): ColorSchemeSnapshot {
  return calculateColorScheme(sources, primary).snapshot;
}

/**
 * The dark counterpart of a snapshot's roles, read from its stored scales
 * (nothing is stored for it): neutral 950 / 900 / 800 as page, card and
 * muted surface, neutral 50 as text, like shadcn's dark defaults. `primary`
 * stays the light one when it stands out from the page at 3:1, else it is
 * the first brand step that does; `destructive` stays the light one, it
 * carries white text.
 */
export function calculateDarkRoles(snapshot: ColorSchemeSnapshot, lightOrigins: Partial<Record<RoleName, RoleOrigin>> = {}) {
  const diagnostics: SchemeDiagnostic[] = [];
  const origins = new Map<Role, RoleOrigin>();
  const scale = (name: string) => snapshot.scales.find((s) => s.name === name)!;
  const brand = scale("brand");
  const neutral = scale("neutral");
  const at = (scale: Scale, step: Step): Role => {
    const value = { hex: scale.steps[step], derivation: `${scale.name}-${step}` };
    origins.set(value, { kind: "scale", name: scale.name, step });
    return value;
  };

  const background = at(neutral, 950);
  const muted = at(neutral, 800);
  const lightest = at(neutral, 50);
  const light = snapshot.roles.primary;
  const primary: Role =
    contrastRatio(light.hex, background.hex) >= 3
      ? { hex: light.hex, derivation: light.derivation }
      : at(brand, firstStep(brand, brand.anchorStep, [background.hex], 3, true));
  if (!origins.has(primary) && lightOrigins.primary) origins.set(primary, lightOrigins.primary);
  const onPrimary =
    contrastRatio(primary.hex, WHITE) >= 4.5 || contrastRatio(primary.hex, WHITE) >= contrastRatio(primary.hex, background.hex)
      ? { hex: WHITE, derivation: "Weiß" }
      : background;

  if (onPrimary !== background) origins.set(onPrimary, { kind: "white" });
  if (lightOrigins.destructive) origins.set(snapshot.roles.destructive, lightOrigins.destructive);
  const values: Record<RoleName, Role> = {
    background,
    foreground: lightest,
    card: at(neutral, 900),
    "card-foreground": lightest,
    muted,
    "muted-foreground": at(neutral, firstStep(neutral, 400, [muted.hex, background.hex], 4.5, true)),
    border: at(neutral, 800),
    primary,
    "primary-foreground": onPrimary,
    ring: primary,
    destructive: snapshot.roles.destructive,
  };
  const rated = rateRoles(values, diagnostics);
  const roleOrigins = Object.fromEntries(ROLE_NAMES.map((role) => [role, origins.get(values[role])]));
  return { ...rated, diagnostics, roleOrigins };
}

/** Stable dark snapshot API for existing callers. Metadata is returned only by calculateDarkRoles. */
export function buildDarkRoles(snapshot: ColorSchemeSnapshot): Pick<ColorSchemeSnapshot, "roles" | "warnings"> {
  const { roles, warnings } = calculateDarkRoles(snapshot, {});
  return { roles, warnings };
}

/** Names an extra colour's scale may not take: the fixed scales and every role, also the shadcn ones the export adds. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "brand",
  "neutral",
  "danger",
  ...ROLE_NAMES,
  "popover",
  "popover-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "input",
]);

/** Why a name does not work for an extra colour, or null when it does. Lowercase letters, words joined by `-`, no digits. */
export function checkExtraName(name: string, taken: readonly string[]): "invalid" | "reserved" | "taken" | null {
  if (!/^[a-z]+(-[a-z]+)*$/.test(name)) return "invalid";
  if (RESERVED_NAMES.has(name)) return "reserved";
  if (taken.includes(name)) return "taken";
  return null;
}

/** A name for an extra colour: the nearest Tailwind scale (`teal`), the next best free one when that is taken. */
export function suggestExtraName(hex: string, taken: readonly string[]): string {
  const color = hexToOklch(hex);
  if (!color) throw new Error(`Not a hex colour: ${hex}`);
  // 26 templates against at most five taken names: one is always free.
  return rankTemplates(color).find(({ name }) => checkExtraName(name, taken) === null)!.name;
}
