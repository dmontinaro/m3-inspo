export * as schema from "./schema";
export { hasDatabase, getDb } from "./client";
export {
  filterScreens,
  findScreen,
  findSimilar,
  type FindSimilarOptions,
  type SimilarResult,
  findSite,
  getMultiPageSites,
  findComponents,
  type ComponentHit,
  findCollection,
  getReferenceComponents,
  findReferenceComponent,
  type ApprovedBrandKit,
  type Catalogue,
  type ScreenFilter,
  type SiteSummary,
} from "./queries";
export { renderDesignMd } from "./design-md";
export { QUALITY_FLOOR, isDamaged, isLowQuality } from "./quality";
export {
  lexicalSearch,
  searchScreens,
  rankForBrief,
  findByHostname,
  hostnameOf,
  isUrl,
} from "./search";
export {
  embedQuery,
  embedText,
  cosineSim,
  fuseRankings,
  embeddingModel,
  embeddingsEnabled,
  EMBEDDING_DIMS,
} from "./vector";
export { selectPool } from "./pool";
