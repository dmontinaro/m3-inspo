/**
 * What the owner reads on the tools page (routes/_library/werkzeuge.tsx):
 * one entry per MCP tool in packages/mcp/src/tools.ts, keyed by the exact
 * registered name. A test compares the keys with the server's tools/list,
 * so adding or renaming a tool means updating this guide as well.
 *
 * Status and note describe what the tool delivers on today's catalogue
 * (packages/db/src/catalogue.ts): images, title, source, notes, collections,
 * design values with their provenance (URL import and AI analysis), AI tags
 * and macrostructure, and with EMBEDDINGS_API_KEY embeddings. Marked regions are available through find_components; code templates remain optional.
 */

/** The sections of the page, in display order. */
export const toolGroups = [
  { id: "find", title: "Finden & Empfehlen" },
  { id: "details", title: "Details & Designwerte" },
  { id: "compare", title: "Vergleichen & Ähnliches" },
  { id: "collections", title: "Sammlungen" },
  { id: "components", title: "Komponenten & Codevorlagen" },
  { id: "brand-kits", title: "Brand Kits" },
] as const;

/** ready: does its job today. limited: works, but misses data or behaviour. empty: nothing useful comes back yet. */
export const toolStatuses = ["ready", "limited", "empty"] as const;
export type ToolStatus = (typeof toolStatuses)[number];

export type ToolGuide = {
  group: (typeof toolGroups)[number]["id"];
  /** Sinn und Zweck, one line. */
  purpose: string;
  /** Wann nutzen: what an agent would ask when it reaches for the tool. */
  askedFor: string;
  status: ToolStatus;
  /** Why the tool has this status today. */
  note: string;
};

export const mcpToolGuide = {
  generate_color_scheme: {
    group: "brand-kits",
    purpose: "Entwirft aus Startfarben ein Color Scheme: Rollen mit Kontrastwert, Skalen 50–950, CSS-Block und einen Link in den Generator.",
    askedFor: "Mach mir für das Briefing einen Farbvorschlag, das Orange von Harbor bleibt.",
    status: "ready",
    note: "Rechnet Rollen, Skalen und Warnungen wie der Generator und speichert nichts. Fehlende Marke oder Neutral würfelt es aus den Paletten deiner freigegebenen Referenzen (alle, ein Projekt oder genannte Referenzen) und nennt die Referenz. Ohne Farben im Pool würfelt es frei.",
  },
  list_brand_kits: {
    group: "brand-kits",
    purpose: "Listet deine freigegebenen Brand Kits: Name, Slug, Projekt, Markenfarbe und Primary.",
    askedFor: "Gibt es für Harbor schon ein Brand Kit?",
    status: "ready",
    note: "Zeigt nur freigegebene Kits, Entwürfe und archivierte nie. Eine Freigabe wirkt beim nächsten Aufruf. Auf Wunsch nur das Kit eines Projekts.",
  },
  get_brand_kit: {
    group: "brand-kits",
    purpose: "Liefert ein freigegebenes Brand Kit vollständig: Rollen mit Kontrastwert, Skalen, Warnungen, Quellfarben, deine Hinweise und den CSS-Block.",
    askedFor: "Bau die Buchungsseite für Harbor in den Farben des Brand Kits.",
    status: "ready",
    note: "Per Slug oder Projekt, immer aus der gespeicherten Momentaufnahme. Deine Hinweise kommen wörtlich mit, der CSS-Block ist derselbe wie beim Kopieren. Quell-Referenzen nennt es mit Slug und Titel; archivierte fehlen, gelöschte heißen gelöscht. Ohne freigegebenes Kit meldet es das, ohne Entwürfe zu zeigen. recommend und search_screens verweisen bei einem Projekt mit Kit darauf.",
  },
  recommend: {
    group: "find",
    purpose: "Startpunkt für ein Briefing: deine passenden Referenzen mit deinen Notizen, Seitenaufbau und Palette in einem Aufruf.",
    askedFor: "Ich baue eine ruhige Landingpage für ein Boutique-Hotel. Womit fange ich an?",
    status: "ready",
    note: "Rankt nach Wörtern und Bedeutung; Favoriten und Treffer in deinen Notizen zählen stärker. Je Treffer kommen Übernehmen, Vermeiden und Fokus wörtlich mit. Sammlung und Projekt filtern hart: Bei weniger als drei Treffern meldet es die Lücke, statt die Filter zu lockern. Eigene Gestaltungsregeln von Inspo gibt es nicht mehr.",
  },
  search_screens: {
    group: "find",
    purpose: "Durchsucht die freigegebenen Referenzen nach Text und Filtern wie Stil, Branche oder Hell/Dunkel.",
    askedFor: "Zeig mir dunkle Referenzen mit großer, ruhiger Typografie.",
    status: "limited",
    note: "Sucht in Titel, Notizen, deinen Tags und der KI-Analyse, mit Embeddings auch nach Bedeutung: Ein deutsches Briefing findet englisch getaggte Referenzen. Auf Wunsch nur in einer Sammlung oder einem Projekt. Die Filter nach Papierhelligkeit, Schriftbauart und Akzentfarbe greifen noch nicht.",
  },
  find_by_color: {
    group: "find",
    purpose: "Findet Referenzen, deren Palette nahe an einer Hex-Farbe liegt.",
    askedFor: "Die Marke ist Tannengrün #1f4d3a. Wer setzt so eine Farbe gut ein?",
    status: "ready",
    note: "Sucht in den Paletten aus URL-Import (aus der Seite gelesen) und KI-Analyse (geschätzt). Jeder Treffer nennt die nächste Farbe und ihre Herkunft, Schätzungen mit Konfidenz.",
  },
  find_examples_for_macrostructure: {
    group: "find",
    purpose: "Zeigt echte Beispiele für einen benannten Seitenaufbau, etwa Bento-Grid oder Marquee-Hero.",
    askedFor: "Ich will ein Bento-Grid bauen. Wie sieht das auf echten Seiten aus?",
    status: "ready",
    note: "Findet Referenzen, deren KI-Analyse diesen Seitenaufbau erkannt hat, eine je Website, jede mit ihren markierten Bereichen.",
  },
  get_filters: {
    group: "find",
    purpose: "Listet alle Werte, die die Filter der anderen Werkzeuge annehmen.",
    askedFor: "Welche Stile und Seitenaufbauten kann ich als Filter angeben?",
    status: "ready",
    note: "Das Vokabular ist fest eingebaut. Die Abdeckung zählt je Seitenaufbau die freigegebenen Referenzen, deren KI-Analyse ihn erkannt hat.",
  },
  get_screen: {
    group: "details",
    purpose: "Holt eine Referenz komplett: Bilder, Quelle und deine Notizen zu Übernehmen, Vermeiden, Fokus und Favorit.",
    askedFor: "Was soll ich von dieser Referenz übernehmen, und was lieber nicht?",
    status: "ready",
    note: "Liefert Bilder, Quelle, Notizen, KI-Analyse und Designwerte. Jeder Wert nennt seine Herkunft: aus der Seite gelesen oder von der KI geschätzt, dann mit Konfidenz. Was nicht gemessen wurde, bleibt leer.",
  },
  get_design_system: {
    group: "details",
    purpose: "Gibt die Designwerte einer Referenz als DESIGN.md aus: Schriften, Palette, CSS-Variablen, Typo-Skala.",
    askedFor: "Welche Schriften, Farben und Abstände nutzt diese Seite?",
    status: "ready",
    note: "Gibt die gespeicherten Designwerte mit Herkunft je Wert aus. Die Quellseite liest es nur auf ausdrückliche Anfrage live, über die URL-Prüfung und mit Zeit- und Größenlimit; gespeichert wird davon nichts.",
  },
  get_site_pages: {
    group: "details",
    purpose: "Zeigt die Seiten einer Website in Reihenfolge, etwa Start, Preise, Features.",
    askedFor: "Wie führt diese Website von der Startseite zur Preisseite?",
    status: "ready",
    note: "Fasst Referenzen derselben Website (gleicher Host) zusammen: Startseite zuerst, dann nach der Seitenart aus der Adresse. Hochgeladene Bilder ohne Adresse bleiben einzelne Seiten.",
  },
  compare: {
    group: "compare",
    purpose: "Stellt zwei bis vier Referenzen nebeneinander und zeigt, was sie gemeinsam haben.",
    askedFor: "Was haben diese drei Referenzen gemeinsam, und worin unterscheiden sie sich?",
    status: "ready",
    note: "Stellt Palette, Schriften, Skalen und Seitenaufbau nebeneinander, jeweils mit Herkunft. Nicht Gemessenes bleibt leer statt 0.",
  },
  find_similar: {
    group: "compare",
    purpose: "Findet die gestalterisch nächsten Nachbarn einer Referenz.",
    askedFor: "Diese Referenz passt gut. Gibt es mehr in dieser Richtung?",
    status: "ready",
    note: "Rankt nach Embeddings über Titel, Notizen, Tags und KI-Beschreibung. Ohne EMBEDDINGS_API_KEY zählen nur gemeinsame KI-Tags.",
  },
  list_collections: {
    group: "collections",
    purpose: "Listet deine Sammlungen mit Beschreibung, Projekt und Anzahl.",
    askedFor: "Welche Sammlungen gibt es für das Hotelprojekt?",
    status: "ready",
    note: "Liefert alle Sammlungen. Gezählt werden nur freigegebene Referenzen.",
  },
  get_collection: {
    group: "collections",
    purpose: "Holt eine Sammlung mit Beschreibung und ihren Referenzen in deiner Reihenfolge.",
    askedFor: "Zeig mir alle Referenzen aus der Sammlung „Ruhige Hotels“.",
    status: "ready",
    note: "Liefert nur freigegebene Referenzen. Eine leere Sammlung sagt das ausdrücklich.",
  },
  find_components: {
    group: "components",
    purpose: "Findet einzelne Bausteine wie Hero, Navigation oder Footer auf echten Seiten, mit Ausschnitt.",
    askedFor: "Zeig mir gute Navigationsleisten aus echten Seiten.",
    status: "ready",
    note: "Findet die Bereiche, die du in der Detailansicht markiert hast, mit Zuschnitt und Notiz. Ist noch keiner vom Typ markiert, kommen ganze Seiten, deren KI-Tags den Baustein nennen.",
  },
  find_reference_components: {
    group: "components",
    purpose: "Verzeichnis der Codevorlagen je Bausteintyp, etwa Hero, Pricing oder Footer.",
    askedFor: "Gibt es eine fertige Vorlage für einen Preisbereich?",
    status: "empty",
    note: "Es sind keine Codevorlagen gepflegt. Das Werkzeug sagt das dem Agenten klar und liefert keine Vorlagen aus dem Original.",
  },
  get_reference_jsx: {
    group: "components",
    purpose: "Liefert den React- und Tailwind-Code einer Codevorlage.",
    askedFor: "Gib mir den Code für diese Hero-Vorlage.",
    status: "empty",
    note: "Es sind keine Codevorlagen gepflegt. Das Werkzeug sagt das dem Agenten klar und liefert keine Vorlagen aus dem Original.",
  },
} satisfies Record<string, ToolGuide>;
