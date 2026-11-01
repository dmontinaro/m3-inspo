import * as m from "#/paraglide/messages.js";
/**
 * What the owner reads on the tools page (routes/_library/tools.tsx):
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
  { id: "find", get title() { return m.tools_group_find(); } },
  { id: "details", get title() { return m.tools_group_details(); } },
  { id: "compare", get title() { return m.tools_group_compare(); } },
  { id: "collections", get title() { return m.collections_title(); } },
  { id: "components", get title() { return m.tools_group_components(); } },
  { id: "brand-kits", get title() { return m.brand_kits_title(); } },
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
    get purpose() { return m.tool_generate_purpose(); },
    get askedFor() { return m.tool_generate_example(); },
    status: "ready",
    get note() { return m.tool_generate_state(); },
  },
  list_brand_kits: {
    group: "brand-kits",
    get purpose() { return m.tool_list_kits_purpose(); },
    get askedFor() { return m.tool_list_kits_example(); },
    status: "ready",
    get note() { return m.tool_list_kits_state(); },
  },
  get_brand_kit: {
    group: "brand-kits",
    get purpose() { return m.tool_get_kit_purpose(); },
    get askedFor() { return m.tool_get_kit_example(); },
    status: "ready",
    get note() { return m.tool_get_kit_state(); },
  },
  recommend: {
    group: "find",
    get purpose() { return m.tool_recommend_purpose(); },
    get askedFor() { return m.tool_recommend_example(); },
    status: "ready",
    get note() { return m.tool_recommend_state(); },
  },
  search_screens: {
    group: "find",
    get purpose() { return m.tool_search_purpose(); },
    get askedFor() { return m.tool_search_example(); },
    status: "limited",
    get note() { return m.tool_search_state(); },
  },
  find_by_color: {
    group: "find",
    get purpose() { return m.tool_color_purpose(); },
    get askedFor() { return m.tool_color_example(); },
    status: "ready",
    get note() { return m.tool_color_state(); },
  },
  find_examples_for_macrostructure: {
    group: "find",
    get purpose() { return m.tool_macro_purpose(); },
    get askedFor() { return m.tool_macro_example(); },
    status: "ready",
    get note() { return m.tool_macro_state(); },
  },
  get_filters: {
    group: "find",
    get purpose() { return m.tool_taxonomy_purpose(); },
    get askedFor() { return m.tool_taxonomy_example(); },
    status: "ready",
    get note() { return m.tool_taxonomy_state(); },
  },
  get_screen: {
    group: "details",
    get purpose() { return m.tool_reference_purpose(); },
    get askedFor() { return m.tool_reference_example(); },
    status: "ready",
    get note() { return m.tool_reference_state(); },
  },
  get_design_system: {
    group: "details",
    get purpose() { return m.tool_design_purpose(); },
    get askedFor() { return m.tool_design_example(); },
    status: "ready",
    get note() { return m.tool_design_state(); },
  },
  get_site_pages: {
    group: "details",
    get purpose() { return m.tool_flow_purpose(); },
    get askedFor() { return m.tool_flow_example(); },
    status: "ready",
    get note() { return m.tool_flow_state(); },
  },
  compare: {
    group: "compare",
    get purpose() { return m.tool_compare_purpose(); },
    get askedFor() { return m.tool_compare_example(); },
    status: "ready",
    get note() { return m.tool_compare_state(); },
  },
  find_similar: {
    group: "compare",
    get purpose() { return m.tool_similar_purpose(); },
    get askedFor() { return m.tool_similar_example(); },
    status: "ready",
    get note() { return m.tool_similar_state(); },
  },
  list_collections: {
    group: "collections",
    get purpose() { return m.tool_collections_purpose(); },
    get askedFor() { return m.tool_collections_example(); },
    status: "ready",
    get note() { return m.tool_collections_state(); },
  },
  get_collection: {
    group: "collections",
    get purpose() { return m.tool_collection_purpose(); },
    get askedFor() { return m.tool_collection_example(); },
    status: "ready",
    get note() { return m.tool_collection_state(); },
  },
  find_components: {
    group: "components",
    get purpose() { return m.tool_components_purpose(); },
    get askedFor() { return m.tool_components_example(); },
    status: "ready",
    get note() { return m.tool_components_state(); },
  },
  find_reference_components: {
    group: "components",
    get purpose() { return m.tool_templates_purpose(); },
    get askedFor() { return m.tool_templates_example(); },
    status: "empty",
    get note() { return m.tool_templates_state(); },
  },
  get_reference_jsx: {
    group: "components",
    get purpose() { return m.tool_template_purpose(); },
    get askedFor() { return m.tool_template_example(); },
    status: "empty",
    get note() { return m.tool_templates_state(); },
  },
} satisfies Record<string, ToolGuide>;
