/**
 * The CSS export of a snapshot (spec #44, "Export"): a `:root` block with
 * every role and scale step in `oklch()`, a `.dark` block with the dark
 * roles under the same names (plain CSS is these two blocks), plus
 * `@theme inline` mapping all of it to Tailwind v4's `--color-*`. Built
 * from the stored snapshot; the dark roles are read from its scales.
 * A kit with typography adds `--font-heading`, `--font-body` and, if set,
 * `--font-mono` to `:root`, mapped to Tailwind's `font-*` utilities.
 */

import { formatOklch } from "../color";
import { cssFontStack, fontRoles, type FontRoles } from "../fonts";
import { STEPS } from "./scale";
import { ROLE_NAMES, buildDarkRoles, type ColorSchemeSnapshot, type Role, type RoleName } from "./scheme";

/**
 * shadcn's optional roles, as references to the 11 roles: popover reads
 * like card, secondary and accent (shadcn's hover surface) like muted,
 * input like border. Text on secondary and accent is the main foreground,
 * as in shadcn's defaults; muted-foreground would grey out labels.
 */
const SHADCN_REFERENCES = [
  ["popover", "card"],
  ["popover-foreground", "card-foreground"],
  ["secondary", "muted"],
  ["secondary-foreground", "foreground"],
  ["accent", "muted"],
  ["accent-foreground", "foreground"],
  ["input", "border"],
] as const;

/** `css`: the `:root` and `.dark` blocks. `tailwind` (the default, what agents get): the blocks plus `@theme inline`. */
export type CssFormat = "css" | "tailwind";

/**
 * The roles plus shadcn's references to them. `.dark` repeats the
 * references: `var()` resolves where it is declared, so the ones on
 * `:root` would keep the light values.
 */
const roleLines = (roles: Record<RoleName, Role>) => [
  ...ROLE_NAMES.map((role) => `  --${role}: ${formatOklch(roles[role].hex)};`),
  ...SHADCN_REFERENCES.map(([role, target]) => `  --${role}: var(--${target});`),
];

/**
 * `fonts` are a kit's font roles; without them the export holds colours only.
 * `@theme inline` maps `--font-heading` to itself: Tailwind then writes
 * `font-family: var(--font-heading)` into the utility and `:root` decides.
 */
export function exportCss(snapshot: ColorSchemeSnapshot, format: CssFormat = "tailwind", fonts?: FontRoles | null): string {
  const scales = snapshot.scales.flatMap(({ name, steps }) =>
    STEPS.map((step) => `  --${name}-${step}: ${formatOklch(steps[step])};`),
  );
  const fontVariables = fontRoles.flatMap((role) => {
    const font = fonts?.[role];
    return font ? [{ name: `font-${role}`, stack: cssFontStack(font) }] : [];
  });
  const fontLines = fontVariables.map(({ name, stack }) => `  --${name}: ${stack};`);
  const root = [":root {", ...roleLines(snapshot.roles), "", ...scales, ...(fontLines.length > 0 ? ["", ...fontLines] : []), "}", ""];
  const dark = [".dark {", ...roleLines(buildDarkRoles(snapshot).roles), "}", ""];
  if (format === "css") return [...root, ...dark].join("\n");
  const variables = [
    ...ROLE_NAMES,
    ...SHADCN_REFERENCES.map(([role]) => role),
    ...snapshot.scales.flatMap(({ name }) => STEPS.map((step) => `${name}-${step}`)),
  ];
  const theme = [...variables.map((name) => `  --color-${name}: var(--${name});`), ...fontVariables.map(({ name }) => `  --${name}: var(--${name});`)];
  return [...root, ...dark, "@theme inline {", ...theme, "}", ""].join("\n");
}
