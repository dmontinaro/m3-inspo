/**
 * Brand Kits (spec #44, "Brand Kits" and "Speichern und Kit-Seite"): Color
 * Schemes the owner saved, with name, optional project, status, notes and
 * source references. Part of the library; server functions
 * (brand-kits.functions.ts) call only this module.
 *
 * Every write takes the sources and the `primary` strategy, builds the
 * snapshot here with today's generator and checks the whole Color Scheme
 * with Zod before it is stored. The snapshot changes only on a save:
 * loading compares it with what the generator computes today and reports
 * a difference as `outdated`, never fixing it silently.
 *
 * Lifecycle (#48): `draft → approved → archived`. An approved kit applies to
 * its project; approving another kit of the same project resets the first to
 * draft. Restoring an archived kit makes it a draft. Deleting a source
 * reference strips its id from the kits' origins (`forgetSourceReference`).
 *
 * Typography (#68): optional, saved together with the Color Scheme. Its font
 * roles are a copy (of a type pairing or set directly); the pairing stays
 * only as origin, and deleting it leaves the roles
 * (type-pairings.server.ts, `removeTypePairing`).
 */

import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { assetsPath } from "@m3-inspo/db/catalogue";
import { getDb } from "@m3-inspo/db/client";
import { brandKitReferences, brandKits, references, typePairings } from "@m3-inspo/db/library-schema";
import type { BrandKitStatus } from "@m3-inspo/db/library-schema";
import { MAX_EXTRAS, ROLE_NAMES, STEPS, buildColorScheme, checkExtraName, exportCss } from "@m3-inspo/shared/color-scheme";
import type { ColorScheme, ColorSchemeSnapshot, ColorSources, SourceColor } from "@m3-inspo/shared/color-scheme";
import type { Typography } from "@m3-inspo/shared/fonts";
import { z } from "zod";
import { maxBrandKitNameLength } from "#/lib/brand-kits";
import { disallowedTagCharacters, maxTagLength, normalizeTag } from "#/lib/tags";
import { kitFontRoles } from "./font-roles";
import { slugify, withRandomSuffix } from "./slug";

/* ────────────── The stored Color Scheme ────────────── */

const hexSchema = z.string().regex(/^#[0-9a-f]{6}$/);
const lockSchema = z.enum(["open", "hue", "exact"]);
const seedSchema = z.number().int().min(0).max(2 ** 32 - 1);

const originSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reference"),
    referenceId: z.uuid().nullable(),
    measuredBy: z.enum(["dom", "vision", "image"]),
    seed: seedSchema.optional(),
  }),
  z.object({ kind: z.literal("rolled"), seed: seedSchema }),
  z.object({ kind: z.literal("manual") }),
]);

const sourceSchema = z.object({ hex: hexSchema, lock: lockSchema, origin: originSchema });

/** Brand, neutral and 0–5 extras whose names are valid, free and unique. */
const sourcesSchema = z
  .object({ brand: sourceSchema, neutral: sourceSchema, extras: z.array(sourceSchema.extend({ name: z.string() })).max(MAX_EXTRAS) })
  .refine(
    ({ extras }) => extras.every(({ name }, index) => checkExtraName(name, extras.slice(0, index).map((extra) => extra.name)) === null),
    { path: ["extras"], message: "Invalid or duplicate extra name." },
  );

const primarySchema = z.enum(["vivid", "hold"]);

const stepsSchema = z.object({ 50: hexSchema, 100: hexSchema, 200: hexSchema, 300: hexSchema, 400: hexSchema, 500: hexSchema, 600: hexSchema, 700: hexSchema, 800: hexSchema, 900: hexSchema, 950: hexSchema });

const snapshotSchema = z.object({
  scales: z.array(z.object({ name: z.string(), anchorStep: z.literal(STEPS), steps: stepsSchema })),
  roles: z.record(
    z.enum(ROLE_NAMES),
    z.object({
      hex: hexSchema,
      derivation: z.string(),
      contrast: z.object({ against: z.enum([...ROLE_NAMES, "white"]), ratio: z.number(), min: z.number() }).optional(),
    }),
  ),
  warnings: z.array(z.object({ role: z.enum(ROLE_NAMES), message: z.string() })),
});

/** A Color Scheme as `brand_kits.color_scheme` stores it. */
const colorSchemeSchema = z.object({ sources: sourcesSchema, primary: primarySchema, snapshot: snapshotSchema }) satisfies z.ZodType<ColorScheme>;

/** What a save sends: the sources and the `primary` strategy. The snapshot is built here. */
export const colorSchemeInput = colorSchemeSchema.pick({ sources: true, primary: true });
export type ColorSchemeInput = z.infer<typeof colorSchemeInput>;

/** The ids of the references the sources come from, in source order, each once. */
const referenceIds = (input: ColorSchemeInput) => [
  ...new Set(
    [input.sources.brand, input.sources.neutral, ...input.sources.extras].flatMap(({ origin }) =>
      origin.kind === "reference" && origin.referenceId ? [origin.referenceId] : [],
    ),
  ),
];

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** The sources with every origin naming a reference `gone` reports cleared: "aus einer gelöschten Referenz". */
function clearOrigins(sources: ColorSources, gone: (referenceId: string) => boolean): ColorSources {
  const clear = <T extends SourceColor>(color: T): T =>
    color.origin.kind === "reference" && color.origin.referenceId && gone(color.origin.referenceId)
      ? { ...color, origin: { ...color.origin, referenceId: null } }
      : color;
  return { brand: clear(sources.brand), neutral: clear(sources.neutral), extras: sources.extras.map(clear) };
}

/**
 * The Color Scheme to store for `input`: the snapshot built from it, the
 * whole checked with Zod, and the references its sources come from. An
 * origin naming a reference that no longer exists loses the link, as if the
 * reference had been deleted.
 */
async function prepareColorScheme(tx: Transaction, input: ColorSchemeInput) {
  const wanted = referenceIds(input);
  const rows = wanted.length ? await tx.select({ id: references.id }).from(references).where(inArray(references.id, wanted)) : [];
  const existing = new Set(rows.map(({ id }) => id));
  const checked = clearOrigins(input.sources, (id) => !existing.has(id));
  return {
    colorScheme: colorSchemeSchema.parse({ sources: checked, primary: input.primary, snapshot: buildColorScheme(checked, input.primary) }),
    sourceReferenceIds: wanted.filter((id) => existing.has(id)),
  };
}

/* ────────────── The stored typography ────────────── */

/** A kit's typography as `brand_kits.typography` stores it and a save sends it. */
export const typographyInput = z.object({
  roles: kitFontRoles,
  originPairingId: z.uuid().nullable(),
  originPairingDeleted: z.boolean(),
  scale: z.null(),
}) satisfies z.ZodType<Typography>;

/** The typography to store: an origin naming a pairing that no longer exists reads "aus einem gelöschten Pairing". */
async function prepareTypography(tx: Transaction, typography: Typography | null): Promise<Typography | null> {
  if (!typography?.originPairingId) return typography;
  const pairing = await tx.query.typePairings.findFirst({ columns: { id: true }, where: eq(typePairings.id, typography.originPairingId) });
  return pairing ? typography : { ...typography, originPairingId: null, originPairingDeleted: true };
}

/** A slug from the name, with a suffix when it is taken. */
async function freeKitSlug(tx: Transaction, name: string) {
  const base = slugify(name) || "brand-kit";
  const taken = await tx.query.brandKits.findFirst({ columns: { id: true }, where: eq(brandKits.slug, base) });
  return taken ? withRandomSuffix(base) : base;
}

/** Replaces the kit's source references with these. */
async function linkSourceReferences(tx: Transaction, brandKitId: string, ids: string[]) {
  await tx.delete(brandKitReferences).where(eq(brandKitReferences.brandKitId, brandKitId));
  if (ids.length) await tx.insert(brandKitReferences).values(ids.map((referenceId) => ({ brandKitId, referenceId })));
}

/* ────────────── Operations ────────────── */

/** The save dialog's fields. An empty project becomes null; messages are for the owner. */
const kitFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Namen ein.")
    .max(maxBrandKitNameLength, `Der Name ist zu lang (höchstens ${maxBrandKitNameLength} Zeichen).`),
  // One owner tag, stored like the tags of references.
  project: z
    .string()
    .transform(normalizeTag)
    .refine(
      (tag) => tag.replace(disallowedTagCharacters, "") === tag,
      "Das Projekt darf nur Buchstaben, Ziffern, Leerzeichen, - und _ enthalten.",
    )
    .refine((tag) => tag.length <= maxTagLength, `Das Projekt ist zu lang (höchstens ${maxTagLength} Zeichen).`)
    .transform((tag) => tag || null),
});

/** Per field of the save dialog, why it was rejected. */
export type BrandKitErrors = Partial<Record<keyof z.input<typeof kitFields>, string[]>>;

/**
 * Saves a Color Scheme as a new draft kit. The slug comes from the name, with
 * a suffix when it is taken, and stays when the name changes.
 */
export async function createBrandKit(
  fields: { name: string; project: string },
  scheme: ColorSchemeInput,
): Promise<{ ok: true; slug: string } | { ok: false; errors: BrandKitErrors }> {
  const parsed = kitFields.safeParse(fields);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  return getDb().transaction(async (tx) => {
    const slug = await freeKitSlug(tx, parsed.data.name);
    const { colorScheme, sourceReferenceIds } = await prepareColorScheme(tx, scheme);
    const [kit] = await tx.insert(brandKits).values({ slug, ...parsed.data, colorScheme }).returning({ id: brandKits.id });
    await linkSourceReferences(tx, kit.id, sourceReferenceIds);
    return { ok: true as const, slug };
  });
}

/**
 * Replaces the kit's Color Scheme with these sources and today's snapshot,
 * and its typography with this one (null removes it). Answers both as
 * stored: an origin naming a missing reference or pairing has lost its id.
 * Null if the slug is unknown.
 */
export async function overwriteBrandKit(
  slug: string,
  scheme: ColorSchemeInput,
  typography: Typography | null,
): Promise<{ colorScheme: ColorScheme; typography: Typography | null } | null> {
  return getDb().transaction(async (tx) => {
    const kit = await tx.query.brandKits.findFirst({ columns: { id: true }, where: eq(brandKits.slug, slug) });
    if (!kit) return null;
    const { colorScheme, sourceReferenceIds } = await prepareColorScheme(tx, scheme);
    const stored = { colorScheme, typography: await prepareTypography(tx, typography) };
    await tx.update(brandKits).set(stored).where(eq(brandKits.id, kit.id));
    await linkSourceReferences(tx, kit.id, sourceReferenceIds);
    return stored;
  });
}

/** Sets the kit's notes, empty clears them; the Color Scheme stays. False if the slug is unknown. */
export async function setBrandKitNotes(slug: string, notes: string): Promise<boolean> {
  const updated = await getDb()
    .update(brandKits)
    .set({ notes: notes.trim() || null })
    .where(eq(brandKits.slug, slug))
    .returning({ id: brandKits.id });
  return updated.length > 0;
}

/** Saves the brand-specific Markdown verbatim; whitespace-only clears it. */
export async function setBrandKitDesignBriefing(slug: string, designBriefing: string): Promise<boolean> {
  const updated = await getDb()
    .update(brandKits)
    .set({ designBriefing: designBriefing.trim() ? designBriefing : null })
    .where(eq(brandKits.slug, slug))
    .returning({ id: brandKits.id });
  return updated.length > 0;
}

/**
 * Sets the kit's status. Approving resets the project's approved kit to
 * draft in the same transaction (the page asks first); kits without a
 * project may be approved any number of times. False if the slug is unknown.
 */
export async function changeBrandKitStatus(slug: string, status: BrandKitStatus): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const kit = await tx.query.brandKits.findFirst({ columns: { id: true, project: true }, where: eq(brandKits.slug, slug) });
    if (!kit) return false;
    if (status === "approved" && kit.project) {
      await tx
        .update(brandKits)
        .set({ status: "draft" })
        .where(and(eq(brandKits.project, kit.project), eq(brandKits.status, "approved"), ne(brandKits.id, kit.id)));
    }
    await tx.update(brandKits).set({ status }).where(eq(brandKits.id, kit.id));
    return true;
  });
}

const copySuffix = " (Kopie)";

/**
 * Copies the kit as a draft named "… (Kopie)", with its project, Color
 * Scheme and typography as stored, notes, design briefing and source references, and
 * answers the copy's slug. Null if the slug is unknown.
 */
export async function copyBrandKit(slug: string): Promise<{ slug: string } | null> {
  return getDb().transaction(async (tx) => {
    const kit = await tx.query.brandKits.findFirst({
      columns: { id: true, name: true, project: true, colorScheme: true, typography: true, notes: true, designBriefing: true },
      where: eq(brandKits.slug, slug),
      with: { sourceReferences: { columns: { referenceId: true } } },
    });
    if (!kit) return null;
    const name = `${kit.name.slice(0, maxBrandKitNameLength - copySuffix.length).trimEnd()}${copySuffix}`;
    const { project, colorScheme, typography, notes, designBriefing } = kit;
    const copy = { slug: await freeKitSlug(tx, name), name, project, colorScheme, typography, notes, designBriefing };
    const [created] = await tx.insert(brandKits).values(copy).returning({ id: brandKits.id });
    await linkSourceReferences(tx, created.id, kit.sourceReferences.map(({ referenceId }) => referenceId));
    return { slug: copy.slug };
  });
}

/** Deletes the kit for good, its links to source references with it. False if the slug is unknown. */
export async function removeBrandKit(slug: string): Promise<boolean> {
  const deleted = await getDb().delete(brandKits).where(eq(brandKits.slug, slug)).returning({ id: brandKits.id });
  return deleted.length > 0;
}

/**
 * Before a reference is deleted, inside the same transaction: the colours of
 * the kits linked to it lose its id, so their origin reads "from a deleted
 * reference". Values, snapshot and `updated_at` stay; the link itself goes
 * with the reference (cascade).
 */
export async function forgetSourceReference(tx: Transaction, referenceId: string) {
  const kits = await tx
    .select({ id: brandKits.id, colorScheme: brandKits.colorScheme, updatedAt: brandKits.updatedAt })
    .from(brandKits)
    .innerJoin(brandKitReferences, eq(brandKitReferences.brandKitId, brandKits.id))
    .where(eq(brandKitReferences.referenceId, referenceId))
    // A save running meanwhile waits, instead of being overwritten with the scheme read here.
    .for("update", { of: brandKits });
  for (const { id, colorScheme, updatedAt } of kits) {
    const sources = clearOrigins(colorScheme.sources, (gone) => gone === referenceId);
    await tx.update(brandKits).set({ colorScheme: { ...colorScheme, sources }, updatedAt }).where(eq(brandKits.id, id));
  }
}

/** Every kit, the last saved first, with the colours a list shows: the sources and `primary` with the text on it. */
export async function listBrandKits() {
  const rows = await getDb().query.brandKits.findMany({
    columns: { slug: true, name: true, project: true, status: true, colorScheme: true, updatedAt: true },
    orderBy: [desc(brandKits.updatedAt)],
  });
  return rows.map(({ colorScheme: { sources, snapshot }, ...kit }) => ({
    ...kit,
    colors: {
      brand: sources.brand.hex,
      neutral: sources.neutral.hex,
      extras: sources.extras.map(({ name, hex }) => ({ name, hex })),
      primary: snapshot.roles.primary.hex,
      onPrimary: snapshot.roles["primary-foreground"].hex,
    },
  }));
}

/**
 * Whether two snapshots hold the same values. Key order does not count
 * (jsonb reorders keys), and contrast ratios only to within 0.01, so a
 * last-digit change in floating-point maths does not flag a kit.
 */
function sameSnapshot(a: ColorSchemeSnapshot, b: ColorSchemeSnapshot): boolean {
  const ratios = (snapshot: ColorSchemeSnapshot) => ROLE_NAMES.map((role) => snapshot.roles[role].contrast?.ratio ?? 0);
  const withoutRatios = (snapshot: ColorSchemeSnapshot): unknown =>
    JSON.parse(JSON.stringify(snapshot, (key, value: unknown) => (key === "ratio" ? undefined : value)));
  const ratiosB = ratios(b);
  return isDeepStrictEqual(withoutRatios(a), withoutRatios(b)) && ratios(a).every((ratio, index) => Math.abs(ratio - ratiosB[index]) <= 0.01 + 1e-9);
}

/** The kit approved for `project` (its name and slug), or null. */
export async function findApprovedBrandKit(project: string) {
  const kit = await getDb().query.brandKits.findFirst({
    columns: { slug: true, name: true },
    where: and(eq(brandKits.project, project), eq(brandKits.status, "approved")),
  });
  return kit ?? null;
}

/** What the kit page shows of a typography's origin pairing, and compares the roles with. */
const findOriginPairing = (id: string) =>
  getDb().query.typePairings.findFirst({
    columns: { id: true, slug: true, name: true, roles: true, archived: true },
    where: eq(typePairings.id, id),
  });
export type OriginPairing = NonNullable<Awaited<ReturnType<typeof findOriginPairing>>>;

/**
 * One kit with its Color Scheme, its source references (drafts and archived
 * ones too, with their status) and the CSS export of the stored snapshot.
 * `outdated` says the generator now builds other values from the same
 * sources; saving takes them. `approvedInProject` names another kit of the
 * same project that is approved: approving this one resets it to draft.
 * `typographyOrigin` is the pairing the typography came from, as it is
 * now (null without one). Null if the slug is unknown.
 */
export async function findBrandKit(slug: string) {
  const kit = await getDb().query.brandKits.findFirst({
    columns: { id: false },
    where: eq(brandKits.slug, slug),
    with: {
      sourceReferences: {
        columns: {},
        with: {
          reference: {
            columns: { id: true, slug: true, title: true, curationStatus: true },
            with: { captures: { columns: { thumbKey: true }, orderBy: (capture, { asc }) => [asc(capture.createdAt)], limit: 1 } },
          },
        },
      },
    },
  });
  if (!kit) return null;

  const { sourceReferences, colorScheme: scheme, ...fields } = kit;
  const order = referenceIds(scheme);
  const originId = kit.typography?.originPairingId;
  return {
    ...fields,
    approvedInProject: kit.project && kit.status !== "approved" ? await findApprovedBrandKit(kit.project) : null,
    typographyOrigin: originId ? ((await findOriginPairing(originId)) ?? null) : null,
    colorScheme: scheme,
    outdated: !sameSnapshot(buildColorScheme(scheme.sources, scheme.primary), scheme.snapshot),
    css: { css: exportCss(scheme.snapshot, "css"), tailwind: exportCss(scheme.snapshot) },
    sourceReferences: sourceReferences
      .map(({ reference: { captures, ...reference } }) => ({
        ...reference,
        thumbUrl: captures[0] ? `${assetsPath}${captures[0].thumbKey}` : null,
      }))
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
  };
}
