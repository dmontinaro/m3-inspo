/**
 * Pure DESIGN.md renderer for the MCP `get_design_system` tool.
 *
 * No LLM calls. Just templating from a `ScreenSummary`. Cheap; we
 * regenerate on every request. Every value names its provenance, and a
 * section without values is left out rather than filled in.
 */

import type { ScreenSummary, TokenField } from "@m3-inspo/shared";
import { MACROSTRUCTURE_LABELS } from "@m3-inspo/taxonomy";

/** Heuristic role guess for a hex from the palette. */
function guessRole(
  hex: string,
  index: number,
  total: number,
  mode: "light" | "dark",
): string {
  const lum = luminance(hex);
  if (mode === "light") {
    if (lum > 0.85) return index === 0 ? "surface (page bg)" : "surface (raised)";
    if (lum < 0.2) return "ink";
    if (index === total - 1) return "muted";
    if (index === Math.floor(total / 2)) return "accent";
    return "support";
  } else {
    if (lum < 0.15) return index === 0 ? "surface (page bg)" : "surface (raised)";
    if (lum > 0.85) return "ink";
    if (index === Math.floor(total / 2)) return "accent";
    return "support";
  }
}

function luminance(hex: string): number {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return 0.5;
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Best-effort base unit from a sorted spacing scale (e.g. 8 from [8,16,24,32,48]). */
function inferSpacingBase(scale: number[]): number | null {
  if (scale.length < 3) return null;
  // Try common bases in order of likelihood; pick the one that matches the most values.
  const candidates = [4, 8, 6, 10, 12, 16];
  let best: { base: number; hits: number } = { base: 0, hits: 0 };
  for (const base of candidates) {
    const hits = scale.filter((n) => n % base === 0).length;
    if (hits > best.hits) best = { base, hits };
  }
  return best.hits >= Math.max(2, scale.length / 2) ? best.base : null;
}

/**
 * Where value `index` of `field` comes from, e.g. "dom" or "vision,
 * confidence 0.72"; "unknown" when the catalogue row carries no provenance.
 */
function sourceOf(s: ScreenSummary, field: TokenField, index: number): string {
  const provenance = s.provenance?.[field];
  if (typeof provenance === "string") return provenance;
  const value = provenance?.[index];
  if (!value) return "unknown";
  return value.confidence === undefined ? value.source : `${value.source}, confidence ${value.confidence.toFixed(2)}`;
}

/** The sources of a whole field as one italic line, e.g. "_Source: dom._". */
function fieldSource(s: ScreenSummary, field: TokenField): string {
  const provenance = s.provenance?.[field];
  const sources =
    provenance === undefined
      ? ["unknown"]
      : typeof provenance === "string"
        ? [provenance]
        : [...new Set(provenance.map((value) => value.source))];
  return `_Source: ${sources.join(", ")}._`;
}

/**
 * Render the DESIGN.md document for a single screen.
 *
 * Style: terse and agent-readable. Each section ends with a tip the
 * model can act on.
 */
export function renderDesignMd(s: ScreenSummary): string {
  const ds = s.designSystem;
  const lines: string[] = [];
  const macroLabel = s.tags.macrostructure
    ? MACROSTRUCTURE_LABELS[s.tags.macrostructure]
    : null;

  /* ── Header ─────────────────────────────────────────────────── */
  lines.push(`# ${s.title} design system`);
  lines.push("");
  lines.push("> From the owner's design library. Reference material for *intentional* design decisions: adapt, don't copy.");
  lines.push("");
  if (s.sourceUrl) lines.push(`- **Source:** ${s.sourceUrl}`);
  lines.push(`- **Captured:** ${s.capturedAt}`);
  if (s.mode) lines.push(`- **Mode:** ${s.mode}`);
  if (macroLabel) lines.push(`- **Macrostructure:** ${macroLabel}`);
  if (s.designerCredit) lines.push(`- **Designer:** ${s.designerCredit}`);
  if (s.tech.length) lines.push(`- **Stack:** ${s.tech.join(", ")}`);
  lines.push(
    "- **Provenance:** every value names its source: dom = read from the page, image = measured from pixels, vision = estimated by the AI analysis from a screenshot (with confidence 0-1), manual = entered by the owner. A section that is missing was not measured.",
  );
  lines.push("");

  /* ── Tone ───────────────────────────────────────────────────── */
  if (s.description) {
    lines.push("## Tone");
    lines.push("");
    lines.push(s.description);
    lines.push("");
  }

  /* ── Colors ─────────────────────────────────────────────────── */
  if (s.palette.length) {
    lines.push("## Colors");
    lines.push("");
    lines.push("| Hex | Role (heuristic) | Source |");
    lines.push("|---|---|---|");
    s.palette.forEach((hex, i) => {
      // Roles follow from the mode; without one they stay unknown.
      const role = s.mode ? guessRole(hex, i, s.palette.length, s.mode) : "unknown";
      lines.push(`| \`${hex}\` | ${role} | ${sourceOf(s, "palette", i)} |`);
    });
    if (ds.colorWords.length) {
      lines.push("");
      lines.push(`Color words: ${ds.colorWords.map((c) => `*${c}*`).join(", ")}`);
    }
    lines.push("");
  }

  /* ── Typography ─────────────────────────────────────────────── */
  if (s.fonts.length || ds.typeRamp.length) {
    lines.push("## Typography");
    lines.push("");
    if (s.fonts.length) {
      lines.push(`Typefaces: ${s.fonts.map((font, i) => `**${font}** (${sourceOf(s, "fonts", i)})`).join(", ")}`);
      if (sourceOf(s, "fonts", 0).startsWith("vision")) {
        lines.push("");
        lines.push("These are type-style estimates from a screenshot, not font family names.");
      }
      lines.push("");
    }
    if (ds.typeRamp.length) {
      lines.push(fieldSource(s, "typeRamp"));
      lines.push("");
      lines.push("| Role | Family | Size | Weight | Line-height | Letter-spacing |");
      lines.push("|---|---|---|---|---|---|");
      for (const r of ds.typeRamp) {
        lines.push(
          `| ${r.role} | ${r.family} | ${r.sizePx}px | ${r.weight} | ${r.lineHeight} | ${r.letterSpacing} |`,
        );
      }
      lines.push("");
    }
  }

  /* ── Spacing ────────────────────────────────────────────────── */
  if (ds.spacingScale.length) {
    const base = inferSpacingBase(ds.spacingScale);
    lines.push("## Spacing scale");
    lines.push("");
    lines.push(ds.spacingScale.map((n) => `\`${n}px\``).join(" · "));
    lines.push("");
    lines.push(fieldSource(s, "spacingScale"));
    if (base) lines.push("");
    if (base) lines.push(`Base step looks like **${base}px**.`);
    lines.push("");
  }

  /* ── Radius ─────────────────────────────────────────────────── */
  if (ds.radiusScale.length) {
    lines.push("## Border radius");
    lines.push("");
    lines.push(ds.radiusScale.map((n) => `\`${n}px\``).join(" · "));
    lines.push("");
    lines.push(fieldSource(s, "radiusScale"));
    lines.push("");
  }

  /* ── Container ──────────────────────────────────────────────── */
  if (ds.containerWidth) {
    lines.push("## Container");
    lines.push("");
    lines.push(`Max content width: **${ds.containerWidth}px** (${sourceOf(s, "containerWidth", 0)})`);
    lines.push("");
  }

  /* ── CSS variables ──────────────────────────────────────────── */
  // Drop framework runtime noise (Tailwind ring/transform shims, editor
  // kits): they say nothing about the design and drown the real tokens.
  const FRAMEWORK_NOISE = /^--(tw|mly-tw|radix|reach|cdk|mui|chakra|mantine|headlessui|nextui)-/;
  const cssVars = Object.entries(ds.cssVariables).filter(
    ([name]) => !FRAMEWORK_NOISE.test(name),
  );
  if (cssVars.length) {
    lines.push("## CSS variables exposed by the source");
    lines.push("");
    lines.push(fieldSource(s, "cssVariables"));
    lines.push("");
    lines.push("```css");
    lines.push(":root {");
    for (const [name, value] of cssVars.slice(0, 60)) {
      lines.push(`  ${name}: ${value};`);
    }
    if (cssVars.length > 60) lines.push(`  /* …${cssVars.length - 60} more */`);
    lines.push("}");
    lines.push("```");
    lines.push("");
  }

  /* ── Components ─────────────────────────────────────────────── */
  if (s.tags.components.length) {
    lines.push("## Components present");
    lines.push("");
    lines.push(s.tags.components.map((c) => `- ${c.replace(/-/g, " ")}`).join("\n"));
    lines.push("");
  }

  const hasValues =
    s.palette.length > 0 ||
    s.fonts.length > 0 ||
    ds.typeRamp.length > 0 ||
    ds.spacingScale.length > 0 ||
    ds.radiusScale.length > 0 ||
    ds.containerWidth !== null ||
    Object.keys(ds.cssVariables).length > 0;
  if (!hasValues) {
    lines.push("## Design values");
    lines.push("");
    lines.push("None measured or estimated for this reference yet: no palette, fonts or scales. Nothing here is a default.");
    lines.push("");
  }

  /* ── Notes for the agent ────────────────────────────────────── */
  lines.push("## Notes for the agent");
  lines.push("");
  lines.push("- **Adapt, don't copy.** The type ramp is a *starting point*. Scale it to your project's base size; preserve the *ratio*, not the literal pixels.");
  lines.push("- **Color roles are heuristic** (luminance + dominance). Verify against the source URL before committing tokens.");
  lines.push("- **Spacing** assumes a constant base step; round detected values to your project's scale (4 / 8 / 16) when implementing.");
  lines.push("- **CSS variables** dumped above (when present) are the source's *actual* tokens - those are higher signal than guesses.");
  if (macroLabel) {
    lines.push(`- This page's macrostructure is **${macroLabel}**.`);
  }
  lines.push("");

  /* ── Footer ─────────────────────────────────────────────────── */
  lines.push("---");
  lines.push("");
  lines.push("*From the owner's Inspo library. Original site copyright remains with its authors.*");

  return lines.join("\n");
}
