import type { RoleOrigin, SchemeDiagnostic } from "@m3-inspo/shared/color-scheme";
import * as m from "#/paraglide/messages.js";
import { formatNumber } from "./format";

/** Translates neutral calculation data, without parsing persisted German diagnostics. */
export function diagnosticText(problem: SchemeDiagnostic): string {
  const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (problem.kind === "contrast") return m.scheme_warning_contrast({ role: problem.role, against: problem.against, ratio: formatNumber(problem.ratio, options), min: formatNumber(problem.min, options) });
  return m.scheme_warning_distance({ distance: formatNumber(problem.distance, options), min: formatNumber(problem.min, options) });
}

export function roleOriginText(origin: RoleOrigin | undefined): string {
  if (!origin) return "";
  if (origin.kind === "white") return m.role_origin_white();
  if (origin.kind === "darkened_brand") return m.role_origin_darkened_brand();
  return m.role_origin_scale({ name: origin.name, step: formatNumber(origin.step) });
}
