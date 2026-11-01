import type { ContentLanguage } from "./format";

/** The AI and the editor share the same fixed section plan. Owner text stays verbatim. */
export const briefingSections = {
  en: ["Scope", "Design principles", "Proven patterns", "Avoid", "Exceptions", "Evidence and open questions"],
  de: ["Geltungsbereich", "Gestaltungsprinzipien", "Bewährte Muster", "Vermeiden", "Ausnahmen", "Belege und offene Fragen"],
} satisfies Record<ContentLanguage, readonly string[]>;

export function briefingTemplate(name: string, outputLanguage: ContentLanguage): string {
  return `# ${name}\n\n${briefingSections[outputLanguage].map((section) => `## ${section}\n\n- `).join("\n\n")}\n`;
}
