import { webValidator } from "#/lib/validation";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fontCategories } from "#/lib/fonts";
import { findCatalogFontsById, searchFonts } from "./font-catalog.server";

/** Server functions for the font catalog. The global owner gate has already let the caller in. */

/** Catalog families by name and optional category, for the family search of type pairings. */
export const searchFontCatalog = createServerFn({ method: "GET" })
  .validator(webValidator(z.object({ query: z.string().max(100), category: z.enum(fontCategories).optional() })))
  .handler(({ data }) => searchFonts(data));

/** Catalog families by Fontsource id, e.g. for the weights a pairing being edited could add. */
export const getCatalogFonts = createServerFn({ method: "GET" })
  .validator(webValidator(z.object({ ids: z.array(z.string()).max(3) })))
  .handler(({ data }) => findCatalogFontsById(data.ids));
