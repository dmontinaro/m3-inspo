/**
 * Re-export the canonical ranker from @m3-inspo/db so the gallery and
 * the MCP server use one search path. `searchScreens` is the hybrid
 * lexical + cosine entry, `rankForBrief` the same plus the owner's
 * taste for `recommend`; `lexicalSearch` stays exported for the
 * pure-lexical use cases and smoke-test back-compat.
 */

export {
  lexicalSearch,
  searchScreens,
  rankForBrief,
  findByHostname,
  isUrl,
  hostnameOf,
} from "@m3-inspo/db";
