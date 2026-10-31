import { z } from "zod";
import * as m from "#/paraglide/messages.js";
import { formatNumber } from "./format";

type Rule =
  | { code: "web_address" | "tag_characters" | "project_characters" | "url_credentials" | "extra_name" }
  | { code: "tags_max" | "tag_length"; max: number };

/** Custom schemas carry neutral codes and numeric limits, never translated sentences. */
export function validationRule(rule: Rule) {
  return { params: { webProblem: rule } };
}

type ValidationProblem =
  | Rule
  | { code: "required" | "invalid_value"; field: string }
  | { code: "too_long" | "too_small" | "too_large"; field: string; limit: number | bigint }
  | { code: "invalid_input" };

/** Standard Zod fields stay machine data until this request/browser boundary. */
export function validationProblem(issue: z.core.$ZodIssue | undefined): ValidationProblem {
  if (!issue) return { code: "invalid_input" };
  if (issue.code === "custom") {
    const parsed = z.discriminatedUnion("code", [
      z.object({ code: z.enum(["web_address", "tag_characters", "project_characters", "url_credentials", "extra_name"]) }),
      z.object({ code: z.enum(["tags_max", "tag_length"]), max: z.number() }),
    ]).safeParse(issue.params?.webProblem);
    return parsed.success ? parsed.data : { code: "invalid_input" };
  }
  const field = String(issue.path.at(-1) ?? "");
  if (issue.code === "too_big") return { code: issue.origin === "string" ? "too_long" : "too_large", field, limit: issue.maximum };
  if (issue.code === "too_small") return issue.minimum === 1 ? { code: "required", field } : { code: "too_small", field, limit: issue.minimum };
  if (issue.code === "invalid_type") return { code: "required", field };
  return { code: "invalid_value", field };
}

function fieldLabel(field: string): string {
  const labels: Partial<Record<string, () => string>> = {
    title: m.field_title, name: m.field_name, description: m.field_description,
    sourceUrl: m.field_address, url: m.field_address, pageUrl: m.font_page_link,
    project: m.field_project, attribution: m.reference_attribution_label,
    note: m.field_note, notes: m.kit_notes, takeNote: m.field_note, avoidNote: m.field_note,
    tags: m.field_tags, family: m.font_family, weights: m.font_weights,
    focus: m.reference_focus, device: m.field_format, componentType: m.region_component_type,
  };
  return labels[field]?.() ?? m.validation_field();
}

export function issueMessage(issue: z.core.$ZodIssue | undefined): string {
  if (issue?.path.includes("roles")) {
    const field = issue.path.at(-1);
    if (issue.code === "invalid_type" && (field === "heading" || field === "body")) return m.validation_font_roles();
    if (issue.code === "too_small" && field === "weights") return m.validation_font_weights();
  }
  const problem = validationProblem(issue);
  switch (problem.code) {
    case "required": return m.validation_required({ field: fieldLabel(problem.field) });
    case "too_long": return m.validation_too_long({ field: fieldLabel(problem.field), max: formatNumber(Number(problem.limit)) });
    case "too_large": return m.validation_too_large({ field: fieldLabel(problem.field), max: formatNumber(Number(problem.limit)) });
    case "too_small": return m.validation_too_small({ field: fieldLabel(problem.field), min: formatNumber(Number(problem.limit)) });
    case "invalid_value": return m.validation_invalid_value({ field: fieldLabel(problem.field) });
    case "web_address": return m.validation_web_address();
    case "tag_characters": return m.validation_tag_characters();
    case "project_characters": return m.validation_project_characters();
    case "url_credentials": return m.validation_url_credentials();
    case "extra_name": return m.validation_extra_name();
    case "tags_max": return m.validation_tags_max({ max: formatNumber(problem.max) });
    case "tag_length": return m.validation_tag_length({ max: formatNumber(problem.max) });
    case "invalid_input": return m.validation_invalid_input();
  }
}

/** Also used directly in .validator(), before a server-function handler can run. */
export function parseWeb<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(issueMessage(parsed.error.issues[0]));
  return parsed.data;
}

export function webValidator<T extends z.ZodType>(schema: T) {
  return (data: z.input<T>): z.output<T> => {
    return parseWeb(schema, data);
  };
}
