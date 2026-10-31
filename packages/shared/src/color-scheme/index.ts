/**
 * The Color Scheme generator core (spec #44): pure functions the web app's
 * generator and the MCP server share. Build a snapshot from source
 * colours, roll colours from the pool, export CSS, read and write the generator
 * URL.
 */

export * from "./scheme";
export { STEPS, NEUTRAL_CHROMA, type Step } from "./scale";
export {
  completeSources,
  rollSources,
  randomSeed,
  type PoolColor,
  type RollOptions,
  type SourceKey,
  type SourcesDraft,
} from "./roll";
export { exportCss, type CssFormat } from "./export";
export * from "./url";
