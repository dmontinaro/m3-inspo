/**
 * The library's own tables: references (one saved design example each),
 * their captures (the stored images), their analyses (design values with
 * provenance), their embeddings (for semantic search), import jobs
 * (asynchronous work such as capturing a URL), collections (references
 * bundled in the owner's order), regions (areas the owner marked on a
 * capture), the font catalog (a Fontsource mirror for type pairings),
 * Brand Kits (saved Color Schemes), type pairings and font previews. Follows docs/spec.md,
 * section Datenmodell, and spec #44, section Datenmodell.
 */

import { relations, sql } from "drizzle-orm";
import type { Sourced, TypeRampEntry } from "@m3-inspo/shared";
import type { ColorScheme } from "@m3-inspo/shared/color-scheme";
import { fontCategories } from "@m3-inspo/shared/fonts";
import type { FontRoles, Typography } from "@m3-inspo/shared/fonts";
import type { ColorWord, Component, ComponentType, Industry, Macrostructure, Style, Vibe } from "@m3-inspo/taxonomy";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const sourceKind = pgEnum("reference_source_kind", ["url", "image"]);
export const curationStatus = pgEnum("reference_curation_status", ["draft", "approved", "archived"]);
export type CurationStatus = (typeof curationStatus.enumValues)[number];
export const captureViewport = pgEnum("capture_viewport", ["desktop", "mobile", "upload"]);
export const captureKind = pgEnum("capture_kind", ["hero", "full", "original"]);
/** What a reference was made for: a desktop screen or a phone (a mobile app or a mobile site). */
export const referenceDevice = pgEnum("reference_device", ["desktop", "mobile"]);
export type ReferenceDevice = (typeof referenceDevice.enumValues)[number];

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const references = pgTable(
  "references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    sourceKind: sourceKind("source_kind").notNull(),
    sourceUrl: text("source_url"),
    siteHost: text("site_host"),
    attribution: text("attribution"),
    curationStatus: curationStatus("curation_status").notNull().default("draft"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    takeNote: text("take_note"),
    avoidNote: text("avoid_note"),
    /** What the reference is about: the whole page or one area such as hero or navigation. */
    focus: text("focus"),
    /**
     * Its format, "Format" in the app. An upload in a phone screen's
     * proportions starts as "mobile" (apps/web/src/lib/curation.ts,
     * `deviceOfImage`); the owner can change it.
     */
    device: referenceDevice("device").notNull().default("desktop"),
    /**
     * The owner's own tags, e.g. a project ("sample-project") or a topic ("hotel"):
     * trimmed, lowercase, without duplicates (apps/web/src/lib/tags.ts). A
     * project is a tag; there is no separate project field.
     */
    tags: text("tags").array().notNull().default([]),
    /**
     * Full-text search over the owner's own words, tags weighted like notes.
     * The `simple` config does not stem, so German and English terms match
     * alike. Generated texts (AI tags, description) live in analyses and are
     * searched there. `tags_to_text` is an immutable `array_to_string`,
     * created in migration 0004, since generated columns need immutable functions.
     */
    searchDocument: tsvector("search_document").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(take_note, '') || ' ' || coalesce(avoid_note, '') || ' ' || coalesce(focus, '') || ' ' || tags_to_text(tags)), 'B')`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("references_search_idx").using("gin", t.searchDocument),
    index("references_created_idx").on(t.createdAt),
  ],
);

/** A derived, resized copy of a capture, stored under its own key. */
export type CaptureVariant = { key: string; width: number; height: number };
export type CaptureVariants = { preview: CaptureVariant; thumb: CaptureVariant };

export const referenceCaptures = pgTable(
  "reference_captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceId: uuid("reference_id")
      .references(() => references.id, { onDelete: "cascade" })
      .notNull(),
    viewport: captureViewport("viewport").notNull(),
    kind: captureKind("kind").notNull(),
    /** Storage key of the full-size image (re-encoded, without metadata). */
    assetKey: text("asset_key").notNull(),
    /** Storage key of the small grid image. */
    thumbKey: text("thumb_key").notNull(),
    /** The derived sizes: `preview` for the detail view, `thumb` for the grid. */
    variants: jsonb("variants").$type<CaptureVariants>().notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** SHA-256 (hex) of the bytes as received, before re-encoding. */
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("reference_captures_reference_idx").on(t.referenceId)],
);

/**
 * A reference's design tokens, each value with its provenance
 * (`{ value, source }`). A field is absent when nothing was measured.
 * A `fonts` entry with `source: "vision"` is a style estimate from the
 * taxonomy's DISPLAY_CLASSES (e.g. "geometric-sans"), never a family name.
 */
export type AnalysisTokens = {
  palette?: Sourced<string>[];
  fonts?: Sourced<string>[];
  typeRamp?: Sourced<TypeRampEntry>[];
  spacingScale?: Sourced<number>[];
  radiusScale?: Sourced<number>[];
  containerWidth?: Sourced<number>;
  cssVariables?: Record<string, Sourced<string>>;
};

export const analysisMode = pgEnum("analysis_mode", ["light", "dark"]);

/** Tags from the AI analysis, each list limited to its taxonomy allow-list (@m3-inspo/taxonomy). */
export type AnalysisTags = {
  style: Style[];
  industry: Industry[];
  components: Component[];
  vibe: Vibe[];
  colorWords: ColorWord[];
};

/** A generated text in German and English. */
export type Bilingual = { de: string; en: string };

/**
 * What was worked out about a reference, versioned: each row is a complete
 * snapshot, and the one with the highest `version` is current. The capture
 * worker writes version 1 of a URL reference with the values it read from
 * the page (`generated_by` "capture", every token `source: "dom"`). Each AI
 * analysis adds the next version (`generated_by` "analysis", `model` set)
 * with tags and generated texts, which live here, apart from the owner's
 * notes on the reference (apps/web/src/server/analysis.server.ts).
 */
export const referenceAnalyses = pgTable(
  "reference_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceId: uuid("reference_id")
      .references(() => references.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    tokens: jsonb("tokens").$type<AnalysisTokens>().notNull(),
    /** Detected technology, e.g. "Next.js". */
    tech: text("tech").array().notNull().default([]),
    mode: analysisMode("mode"),
    /** The page's <title> when the analysis read one. */
    pageTitle: text("page_title"),
    /** What produced this version: "capture" (the capture worker) or "analysis" (the AI analysis). */
    generatedBy: text("generated_by").notNull(),
    /** The model that wrote tags and texts, e.g. "claude-opus-5-5"; null on capture versions. */
    model: text("model"),
    /** AI tags; null on capture versions. */
    tags: jsonb("tags").$type<AnalysisTags>(),
    /** The page's named whole-page shape (MACROSTRUCTURES), when the analysis found one. */
    macrostructure: text("macrostructure").$type<Macrostructure>(),
    /** What the design does, in a designer's words. */
    description: jsonb("description").$type<Bilingual>(),
    /** How the page is laid out, top to bottom. */
    layoutSummary: jsonb("layout_summary").$type<Bilingual>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("reference_analyses_version_idx").on(t.referenceId, t.version)],
);

/**
 * A reference's text (title, notes, owner and AI tags, AI description) as a
 * vector, one per reference, computed by the web app's embedding job
 * (apps/web/src/server/embedding.server.ts). `model` says which model wrote
 * it; only vectors of the current model are compared. Archiving a reference
 * deletes its row, deleting the reference deletes it by cascade.
 */
export const referenceEmbeddings = pgTable("reference_embeddings", {
  referenceId: uuid("reference_id")
    .primaryKey()
    .references(() => references.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * A region ("Bereich"): a rectangle the owner marked on a capture, with a
 * component type and a note. `x`, `y`, `width` and `height` are pixels of
 * the capture's full-size image (`reference_captures.width`/`height`). The
 * web app cuts the rectangle out when it is marked and stores the crop and
 * a small version under keys of their own (apps/web/src/server/regions.server.ts);
 * the rectangle never changes afterwards, only type and note. Agents find
 * regions through `find_components`. Deleting the reference or the capture
 * deletes the row by cascade; the web app deletes the files.
 */
export const referenceRegions = pgTable(
  "reference_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceId: uuid("reference_id")
      .references(() => references.id, { onDelete: "cascade" })
      .notNull(),
    captureId: uuid("capture_id")
      .references(() => referenceCaptures.id, { onDelete: "cascade" })
      .notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    componentType: text("component_type").$type<ComponentType>().notNull(),
    note: text("note"),
    /** Storage key of the crop at full size (WebP). */
    cropKey: text("crop_key").notNull(),
    /** Storage key of the crop's small version (WebP). */
    thumbKey: text("thumb_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("reference_regions_reference_idx").on(t.referenceId),
    index("reference_regions_capture_idx").on(t.captureId),
  ],
);

export const referenceRegionsRelations = relations(referenceRegions, ({ one }) => ({
  reference: one(references, { fields: [referenceRegions.referenceId], references: [references.id] }),
  capture: one(referenceCaptures, { fields: [referenceRegions.captureId], references: [referenceCaptures.id] }),
}));

export const referencesRelations = relations(references, ({ many, one }) => ({
  captures: many(referenceCaptures),
  regions: many(referenceRegions),
  analyses: many(referenceAnalyses),
  embedding: one(referenceEmbeddings),
  collectionEntries: many(collectionReferences),
  brandKitEntries: many(brandKitReferences),
}));

export const referenceEmbeddingsRelations = relations(referenceEmbeddings, ({ one }) => ({
  reference: one(references, { fields: [referenceEmbeddings.referenceId], references: [references.id] }),
}));

export const referenceCapturesRelations = relations(referenceCaptures, ({ one, many }) => ({
  reference: one(references, { fields: [referenceCaptures.referenceId], references: [references.id] }),
  regions: many(referenceRegions),
}));

export const referenceAnalysesRelations = relations(referenceAnalyses, ({ one }) => ({
  reference: one(references, { fields: [referenceAnalyses.referenceId], references: [references.id] }),
}));

export const importJobKind = pgEnum("import_job_kind", ["url_capture", "analysis", "embedding", "font_preview"]);
export type ImportJobKind = (typeof importJobKind.enumValues)[number];
/** `queued → processing → ready | failed`, separate from a reference's curation status. */
export const importJobStatus = pgEnum("import_job_status", ["queued", "processing", "ready", "failed"]);
export type ImportJobStatus = (typeof importJobStatus.enumValues)[number];

/**
 * What the owner submitted for a `url_capture` job: the page and the fields
 * the new reference starts with.
 */
export type UrlCaptureInput = {
  url: string;
  title?: string;
  takeNote?: string;
  avoidNote?: string;
  tags?: string[];
};

/** Why an `analysis` job was queued; the reference it analyses is the job's `reference_id`. */
export type AnalysisInput = { trigger: "upload" | "import" | "owner" | "backfill" };

/**
 * Why an `embedding` job was queued: a new reference, a finished analysis,
 * an edit of the curation fields or the regions, or a reference brought back from the
 * archive. The reference is the job's `reference_id`.
 */
export type EmbeddingInput = { trigger: "upload" | "import" | "analysis" | "edit" | "restore" | "backfill" };

/** The page a `font_preview` job captures; the preview it fills is the `font_previews` row pointing at the job. */
export type FontPreviewInput = { pageUrl: string };

/**
 * One piece of asynchronous work: capturing a URL or a font's page (the
 * capture worker), analysing a reference or refreshing its embedding (both
 * the web app's job runner). A worker claims it
 * for a lease; an expired lease sends it back to the queue until
 * `max_attempts` (apps/web/src/server/import-jobs.server.ts).
 */
export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: importJobKind("kind").notNull(),
    status: importJobStatus("status").notNull().default("queued"),
    /** Where a running job stands, reported by the worker, e.g. "capturing" or "uploading". */
    stage: text("stage"),
    /**
     * Claims so far. The current holder sends its number back as proof that it
     * still holds the job, so it is never reset: a retry raises `max_attempts`.
     */
    attempts: smallint("attempts").notNull().default(0),
    maxAttempts: smallint("max_attempts").notNull().default(3),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    /** Generated by the client per submission, so a resent form returns the same job. */
    requestId: uuid("request_id").notNull().unique(),
    input: jsonb("input").$type<UrlCaptureInput | AnalysisInput | EmbeddingInput | FontPreviewInput>().notNull(),
    /** Why the job failed, without stack traces, headers, tokens or credentials. */
    errorMessage: text("error_message"),
    /** `url_capture`: the reference the job created, once it is ready. `analysis`, `embedding`: the reference it works on. */
    referenceId: uuid("reference_id").references(() => references.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("import_jobs_queue_idx").on(t.status, t.createdAt)],
);

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  reference: one(references, { fields: [importJobs.referenceId], references: [references.id] }),
}));

/**
 * A collection: references the owner bundles around a theme ("Hotelsoftware")
 * in an order of their own. Agents read collections over MCP with only the
 * approved references inside (packages/db/src/catalogue.ts).
 */
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** Optional owner tag the collection belongs to, e.g. a project such as "sample-project". Normalized like `references.tags`. */
  project: text("project"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** A reference in a collection, at `position` (ascending). Goes when either side is deleted. */
export const collectionReferences = pgTable(
  "collection_references",
  {
    collectionId: uuid("collection_id")
      .references(() => collections.id, { onDelete: "cascade" })
      .notNull(),
    referenceId: uuid("reference_id")
      .references(() => references.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.referenceId] }),
    index("collection_references_reference_idx").on(t.referenceId),
  ],
);

export const collectionsRelations = relations(collections, ({ many }) => ({ entries: many(collectionReferences) }));

export const collectionReferencesRelations = relations(collectionReferences, ({ one }) => ({
  collection: one(collections, { fields: [collectionReferences.collectionId], references: [collections.id] }),
  reference: one(references, { fields: [collectionReferences.referenceId], references: [references.id] }),
}));

/** What a typeface is for, as type pairings and the font catalog name it (CONTEXT.md, Schriften). */
export const fontCategory = pgEnum("font_category", fontCategories);
export type FontCategory = (typeof fontCategory.enumValues)[number];

/**
 * The font catalog: a mirror of Fontsource's metadata (api.fontsource.org),
 * one row per family, refreshed daily by apps/web/src/server/font-catalog.server.ts.
 * The family search for type pairings and the family lookup for "Kombination
 * merken" read only this table, so they work while Fontsource is down.
 * `id` is the Fontsource id (`inter`); `variable` says whether a variable
 * package exists (CSS name "<family> Variable"); `google` whether Google
 * Fonts serves it too; `lastModified` is Fontsource's version date.
 * A sync replaces every row it sees and removes the ones Fontsource dropped.
 */
export const fontCatalog = pgTable(
  "font_catalog",
  {
    id: text("id").primaryKey(),
    family: text("family").notNull(),
    category: fontCategory("category").notNull(),
    weights: integer("weights").array().notNull(),
    styles: text("styles").array().notNull(),
    variable: boolean("variable").notNull(),
    license: text("license").notNull(),
    google: boolean("google").notNull(),
    lastModified: text("last_modified").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("font_catalog_family_idx").on(sql`lower(${t.family})`)],
);

export const brandKitStatus = pgEnum("brand_kit_status", ["draft", "approved", "archived"]);
export type BrandKitStatus = (typeof brandKitStatus.enumValues)[number];

/**
 * A Brand Kit: a Color Scheme the owner saved, optionally for one project
 * (an owner tag, normalized like `references.tags`). `color_scheme` holds
 * the sources, the `primary` strategy and the snapshot built from them; the
 * web app checks it with Zod before every write and builds the snapshot
 * itself (apps/web/src/server/brand-kits.server.ts). It changes only when
 * the owner saves. `typography` is the optional font part, checked with Zod
 * the same way and saved with the Color Scheme; its origin pairing is an id
 * inside the JSON, cleared when that pairing is deleted. At most one approved
 * kit per project; kits without a project may be approved any number of times.
 */
export const brandKits = pgTable(
  "brand_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    project: text("project"),
    status: brandKitStatus("status").notNull().default("draft"),
    colorScheme: jsonb("color_scheme").$type<ColorScheme>().notNull(),
    typography: jsonb("typography").$type<Typography>(),
    /** The owner's notes on how to use the kit; agents read them as reference data, like notes on references. */
    notes: text("notes"),
    /** Brand-specific design patterns in Markdown, separate from the short usage notes. */
    designBriefing: text("design_briefing"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("brand_kits_approved_project_idx")
      .on(t.project)
      .where(sql`${t.status} = 'approved' and ${t.project} is not null`),
  ],
);

/**
 * A source reference of a Brand Kit: a reference at least one source colour
 * of its saved Color Scheme comes from, not the whole pool. Rewritten with
 * every save; goes when either side is deleted.
 */
export const brandKitReferences = pgTable(
  "brand_kit_references",
  {
    brandKitId: uuid("brand_kit_id")
      .references(() => brandKits.id, { onDelete: "cascade" })
      .notNull(),
    referenceId: uuid("reference_id")
      .references(() => references.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.brandKitId, t.referenceId] }),
    index("brand_kit_references_reference_idx").on(t.referenceId),
  ],
);

export const brandKitsRelations = relations(brandKits, ({ many }) => ({ sourceReferences: many(brandKitReferences) }));

export const brandKitReferencesRelations = relations(brandKitReferences, ({ one }) => ({
  brandKit: one(brandKits, { fields: [brandKitReferences.brandKitId], references: [brandKits.id] }),
  reference: one(references, { fields: [brandKitReferences.referenceId], references: [references.id] }),
}));

/** Where a type pairing came from: a reference ("Kombination merken"), a brand kit's typography or the owner by hand. */
export const typePairingOrigin = pgEnum("type_pairing_origin", ["manual", "reference", "brand_kit"]);
export type TypePairingOrigin = (typeof typePairingOrigin.enumValues)[number];

/**
 * A type pairing: a font combination the owner keeps, one family with its
 * weights per font role (`heading`, `body`, optional `mono`). `roles` is
 * checked with Zod on every write (apps/web/src/server/type-pairings.server.ts),
 * which also keeps two pairings from having the same families in the same
 * roles. The slug comes from the name and stays when the name changes.
 * `origin_kind` says where it came from; `origin_reference_id` points at the
 * reference for "reference", `origin_brand_kit_id` at the kit for
 * "brand_kit" ("Als Pairing merken"). Each turns null when its row is
 * deleted; the origin kind stays.
 */
export const typePairings = pgTable(
  "type_pairings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    roles: jsonb("roles").$type<FontRoles>().notNull(),
    note: text("note"),
    originKind: typePairingOrigin("origin_kind").notNull().default("manual"),
    originReferenceId: uuid("origin_reference_id").references(() => references.id, { onDelete: "set null" }),
    originBrandKitId: uuid("origin_brand_kit_id").references(() => brandKits.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("type_pairings_created_idx").on(t.createdAt)],
);

export const typePairingsRelations = relations(typePairings, ({ one }) => ({
  originReference: one(references, { fields: [typePairings.originReferenceId], references: [references.id] }),
  originBrandKit: one(brandKits, { fields: [typePairings.originBrandKitId], references: [brandKits.id] }),
}));

/**
 * A font preview ("Schriftvorschau"): a screenshot of the page a type
 * pairing links for an adobe or local family (`RoleFont.pageUrl`), which the
 * app cannot load itself. One per URL, shared by every pairing that links
 * it. `job_id` is the latest `font_preview` job for it; the image is the
 * last capture that finished (null until one did), so a new capture
 * replaces it only once it succeeds
 * (apps/web/src/server/font-previews.server.ts).
 */
export const fontPreviews = pgTable("font_previews", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull().unique(),
  jobId: uuid("job_id").references(() => importJobs.id, { onDelete: "set null" }),
  /** The capture as WebP, desktop 1440 × 900. */
  imageKey: text("image_key"),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fontPreviewsRelations = relations(fontPreviews, ({ one }) => ({
  job: one(importJobs, { fields: [fontPreviews.jobId], references: [importJobs.id] }),
}));
