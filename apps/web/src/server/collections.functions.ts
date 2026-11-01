import * as m from "#/paraglide/messages.js";
import { webValidator } from "#/lib/validation";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  addToCollection,
  createCollection,
  editCollection,
  findCollection,
  listCollections,
  removeCollection,
  removeFromCollection,
  reorderCollection,
} from "./collections.server";

/** Server functions for the collection pages. The global owner gate has already let the caller in. */

/** Rejects anything but a multipart form, before the handler reads it. */
function formData(data: FormData) {
  if (!(data instanceof FormData)) throw new Error(m.validation_invalid_input());
  return data;
}

/** The collection form's fields as strings; missing ones are empty. */
const collectionForm = (data: FormData) => ({
  name: String(data.get("name") ?? ""),
  description: String(data.get("description") ?? ""),
  project: String(data.get("project") ?? ""),
});

/** Every collection, alphabetically, with count and the first thumbnails. */
export const getCollections = createServerFn({ method: "GET" }).handler(() => listCollections());

/** One collection with its references in order. */
export const getCollection = createServerFn({ method: "GET" })
  .validator(webValidator(z.object({ slug: z.string() })))
  .handler(async ({ data }) => {
    const collection = await findCollection(data.slug);
    if (!collection) throw notFound();
    return collection;
  });

/**
 * The new-collection form: `name`, `description` and `project`. Answers
 * `{ ok: false, errors }` with localized messages per field when rejected.
 */
export const addCollection = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data }) => createCollection(collectionForm(data)));

/** The edit form: `slug` plus the fields of the new-collection form. */
export const updateCollection = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(async ({ data }) => {
    const result = await editCollection(String(data.get("slug")), collectionForm(data));
    if (!result) throw notFound();
    return result;
  });

/** Deletes the collection, not its references; the UI asks for confirmation first. */
export const deleteCollection = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ slug: z.string() })))
  .handler(async ({ data }) => {
    if (!(await removeCollection(data.slug))) throw notFound();
  });

const membership = z.object({ collection: z.string(), reference: z.string() });

/** Adds a reference at the end of a collection. */
export const addReferenceToCollection = createServerFn({ method: "POST" })
  .validator(webValidator(membership))
  .handler(async ({ data }) => {
    if (!(await addToCollection(data.collection, data.reference))) throw notFound();
  });

export const removeReferenceFromCollection = createServerFn({ method: "POST" })
  .validator(webValidator(membership))
  .handler(async ({ data }) => {
    if (!(await removeFromCollection(data.collection, data.reference))) throw notFound();
  });

/** The collection's references in their new order, as slugs. */
export const setCollectionOrder = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ collection: z.string(), references: z.array(z.string()).max(1000) })))
  .handler(async ({ data }) => {
    if (!(await reorderCollection(data.collection, data.references))) throw notFound();
  });
