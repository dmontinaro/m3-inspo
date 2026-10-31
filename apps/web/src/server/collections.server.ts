/**
 * Collections: references the owner bundles around a theme, in an order of
 * their own, optionally tied to a project tag. Part of the library; server
 * functions (collections.functions.ts) call only this module. Agents read
 * collections through the catalogue (packages/db/src/catalogue.ts).
 */

import { and, eq, sql } from "drizzle-orm";
import { assetsPath } from "@m3-inspo/db/catalogue";
import { getDb } from "@m3-inspo/db/client";
import { collectionReferences, collections, references } from "@m3-inspo/db/library-schema";
import { z } from "zod";
import { disallowedTagCharacters, maxTagLength, normalizeTag } from "#/lib/tags";
import { maxCollectionDescriptionLength, maxCollectionNameLength } from "#/lib/collections";
import { slugify, withRandomSuffix } from "./slug";

/** The collection form's fields. Empty description and project become null; messages are for the owner. */
const collectionFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Namen ein.")
    .max(maxCollectionNameLength, `Der Name ist zu lang (höchstens ${maxCollectionNameLength} Zeichen).`),
  description: z
    .string()
    .trim()
    .max(maxCollectionDescriptionLength, `Die Beschreibung ist zu lang (höchstens ${maxCollectionDescriptionLength} Zeichen).`)
    .transform((value) => value || null),
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

/** Per field of the collection form, why it was rejected. */
export type CollectionErrors = Partial<Record<keyof z.input<typeof collectionFields>, string[]>>;

/**
 * Creates a collection from the form (`name`, `description`, `project` as
 * strings). The slug comes from the name and stays when the name changes.
 */
export async function createCollection(
  input: Record<string, unknown>,
): Promise<{ ok: true; slug: string } | { ok: false; errors: CollectionErrors }> {
  const parsed = collectionFields.safeParse(input);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const base = slugify(parsed.data.name) || "sammlung";
  const taken = await getDb().query.collections.findFirst({ columns: { id: true }, where: eq(collections.slug, base) });
  const slug = taken ? withRandomSuffix(base) : base;
  await getDb().insert(collections).values({ slug, ...parsed.data });
  return { ok: true, slug };
}

/** Saves the collection form for `slug`; null if the slug is unknown. */
export async function editCollection(
  slug: string,
  input: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; errors: CollectionErrors } | null> {
  const parsed = collectionFields.safeParse(input);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const updated = await getDb()
    .update(collections)
    .set(parsed.data)
    .where(eq(collections.slug, slug))
    .returning({ id: collections.id });
  return updated.length > 0 ? { ok: true } : null;
}

/** Deletes a collection; its references stay. False if the slug is unknown. */
export async function removeCollection(slug: string): Promise<boolean> {
  const deleted = await getDb().delete(collections).where(eq(collections.slug, slug)).returning({ id: collections.id });
  return deleted.length > 0;
}

/** How many thumbnails a collection card shows. */
const cardThumbnails = 4;

/**
 * Every collection, alphabetically, with how many references it holds (drafts
 * and archived ones too) and the thumbnails of its first ones.
 */
export async function listCollections() {
  const rows = await getDb().query.collections.findMany({
    columns: { slug: true, name: true, description: true, project: true },
    orderBy: () => [sql`lower(${collections.name})`, collections.createdAt],
    with: {
      entries: {
        columns: {},
        orderBy: (entry, { asc }) => [asc(entry.position)],
        with: {
          reference: {
            columns: {},
            with: { captures: { columns: { thumbKey: true }, orderBy: (capture, { asc }) => [asc(capture.createdAt)], limit: 1 } },
          },
        },
      },
    },
  });
  return rows.map(({ entries, ...collection }) => ({
    ...collection,
    count: entries.length,
    thumbUrls: entries
      .flatMap(({ reference }) => reference.captures.map((capture) => `${assetsPath}${capture.thumbKey}`))
      .slice(0, cardThumbnails),
  }));
}

/** One collection with its references in the owner's order, or null if the slug is unknown. */
export async function findCollection(slug: string) {
  const collection = await getDb().query.collections.findFirst({
    columns: { slug: true, name: true, description: true, project: true },
    where: eq(collections.slug, slug),
    with: {
      entries: {
        columns: {},
        orderBy: (entry, { asc }) => [asc(entry.position)],
        with: {
          reference: {
            columns: { slug: true, title: true, curationStatus: true, isFavorite: true, tags: true },
            with: { captures: { columns: { thumbKey: true }, orderBy: (capture, { asc }) => [asc(capture.createdAt)], limit: 1 } },
          },
        },
      },
    },
  });
  if (!collection) return null;

  const { entries, ...fields } = collection;
  return {
    ...fields,
    references: entries.map(({ reference: { captures, ...reference } }) => ({
      ...reference,
      thumbUrl: captures[0] ? `${assetsPath}${captures[0].thumbKey}` : null,
    })),
  };
}

/** The ids behind a collection slug and a reference slug, or null if either is unknown. */
async function findIds(collectionSlug: string, referenceSlug: string) {
  const [collection, reference] = await Promise.all([
    getDb().query.collections.findFirst({ columns: { id: true }, where: eq(collections.slug, collectionSlug) }),
    getDb().query.references.findFirst({ columns: { id: true }, where: eq(references.slug, referenceSlug) }),
  ]);
  return collection && reference ? { collectionId: collection.id, referenceId: reference.id } : null;
}

/**
 * Adds a reference at the end of a collection; one already in it stays where
 * it is. False if either slug is unknown.
 */
export async function addToCollection(collectionSlug: string, referenceSlug: string): Promise<boolean> {
  const ids = await findIds(collectionSlug, referenceSlug);
  if (!ids) return false;

  await getDb()
    .insert(collectionReferences)
    .values({
      ...ids,
      position: sql`(select coalesce(max(${collectionReferences.position}) + 1, 0) from ${collectionReferences} where ${collectionReferences.collectionId} = ${ids.collectionId})`,
    })
    .onConflictDoNothing();
  return true;
}

/** Takes a reference out of a collection; the reference itself stays. False if it was not in it. */
export async function removeFromCollection(collectionSlug: string, referenceSlug: string): Promise<boolean> {
  const ids = await findIds(collectionSlug, referenceSlug);
  if (!ids) return false;

  const deleted = await getDb()
    .delete(collectionReferences)
    .where(and(eq(collectionReferences.collectionId, ids.collectionId), eq(collectionReferences.referenceId, ids.referenceId)))
    .returning({ position: collectionReferences.position });
  return deleted.length > 0;
}

/**
 * Puts a collection's references in the order of `referenceSlugs`. Members the
 * list leaves out (e.g. added in another tab meanwhile) follow in their
 * current order; slugs that are not members are ignored. False if the
 * collection is unknown.
 */
export async function reorderCollection(slug: string, referenceSlugs: string[]): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const collection = await tx.query.collections.findFirst({
      columns: { id: true },
      where: eq(collections.slug, slug),
      with: {
        entries: {
          columns: { referenceId: true },
          orderBy: (entry, { asc }) => [asc(entry.position)],
          with: { reference: { columns: { slug: true } } },
        },
      },
    });
    if (!collection) return false;

    const rank = (entry: (typeof collection.entries)[number]) => {
      const index = referenceSlugs.indexOf(entry.reference.slug);
      return index === -1 ? referenceSlugs.length : index;
    };
    // A stable sort keeps unlisted members in their current order.
    const ordered = collection.entries.sort((a, b) => rank(a) - rank(b));
    for (const [position, entry] of ordered.entries()) {
      await tx
        .update(collectionReferences)
        .set({ position })
        .where(and(eq(collectionReferences.collectionId, collection.id), eq(collectionReferences.referenceId, entry.referenceId)));
    }
    return true;
  });
}
