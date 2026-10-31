import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { curationStatuses, devices } from "#/lib/curation";
import {
  createImageReference,
  editReference,
  findReference,
  listReferences,
  listTagSuggestions,
  removeReference,
  requestAnalysis,
  setFavorite,
  setStatus,
} from "./library.server";

/** Server functions for the library pages. The global owner gate has already let the caller in. */

/** Rejects anything but a multipart form, before the handler reads it. */
function formData(data: FormData) {
  if (!(data instanceof FormData)) throw new Error("Expected form data.");
  return data;
}

/**
 * Upload form: `file` plus `title`, `takeNote`, `avoidNote`, `sourceUrl` and
 * one `tags` entry per tag; all but file and title may be missing. Answers
 * `{ ok: false, reason }` with a German reason when the upload is rejected.
 */
export const uploadImage = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(({ data }) => {
    const text = (name: string) => String(data.get(name) ?? "");
    return createImageReference(data.get("file"), {
      title: text("title"),
      takeNote: text("takeNote"),
      avoidNote: text("avoidNote"),
      sourceUrl: text("sourceUrl"),
      tags: data.getAll("tags"),
    });
  });

/** The gallery with its filters; without any, every reference that is not archived. */
export const listGallery = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        status: z.enum(curationStatuses).optional(),
        favorites: z.boolean().optional(),
        device: z.enum(devices).optional(),
        tag: z.string().max(200).optional(),
        query: z.string().max(200).optional(),
        collection: z.string().max(200).optional(),
      })
      .optional(),
  )
  .handler(({ data }) => listReferences(data));

/** Every tag in use, the most used first: suggestions for the tag input. */
export const listTags = createServerFn({ method: "GET" }).handler(() => listTagSuggestions());

export const getReference = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const reference = await findReference(data.slug);
    if (!reference) throw notFound();
    return reference;
  });

/**
 * The detail view's edit form: `slug` plus the edited fields, one `tags`
 * entry per tag. Answers `{ ok: false, errors }` with German messages per
 * field when rejected.
 */
export const updateReference = createServerFn({ method: "POST" })
  .validator(formData)
  .handler(async ({ data }) => {
    const { slug, ...fields } = Object.fromEntries(data);
    // Without any `tags` entry the tags stay as they are; the tag input always sends one.
    const tags = data.has("tags") ? data.getAll("tags") : undefined;
    const result = await editReference(String(slug), { ...fields, tags });
    if (!result) throw notFound();
    return result;
  });

export const setReferenceStatus = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string(), status: z.enum(curationStatuses) }))
  .handler(async ({ data }) => {
    if (!(await setStatus(data.slug, data.status))) throw notFound();
  });

/** Deletes the reference with all its images for good; the UI asks for confirmation first. */
export const deleteReference = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    if (!(await removeReference(data.slug))) throw notFound();
  });

export const setReferenceFavorite = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string(), isFavorite: z.boolean() }))
  .handler(async ({ data }) => {
    if (!(await setFavorite(data.slug, data.isFavorite))) throw notFound();
  });

/**
 * "Neu analysieren": queues a new AI analysis unless one is waiting or
 * running. Answers "disabled" without ANTHROPIC_API_KEY.
 */
export const reanalyzeReference = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const result = await requestAnalysis(data.slug);
    if (!result) throw notFound();
    return result;
  });
