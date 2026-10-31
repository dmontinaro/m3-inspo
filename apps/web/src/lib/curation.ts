/**
 * Curation vocabulary shared by the detail view, the gallery filters and the
 * server: statuses, focus areas, formats and field limits. Stored values are English
 * keys (agents read them in `taste`); the labels are what the owner sees.
 */

import type { CurationStatus, ReferenceDevice } from "@m3-inspo/db/library-schema";

export const curationStatuses = ["draft", "approved", "archived"] as const satisfies readonly CurationStatus[];

export const statusLabels: Record<CurationStatus, string> = {
  draft: "Entwurf",
  approved: "Freigegeben",
  archived: "Archiviert",
};

/** What a reference is about: the whole page or one area of it. Stored in `references.focus`. */
export const focusAreas = ["page", "hero", "navigation", "form", "pricing", "footer"] as const;
export type FocusArea = (typeof focusAreas)[number];

export const focusLabels: Record<FocusArea, string> = {
  page: "Ganze Seite",
  hero: "Hero",
  navigation: "Navigation",
  form: "Formular",
  pricing: "Preise",
  footer: "Footer",
};

/** A reference's format ("Format"): made for a desktop screen or a phone. Stored in `references.device`. */
export const devices = ["desktop", "mobile"] as const satisfies readonly ReferenceDevice[];

export const deviceLabels: Record<ReferenceDevice, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
};

/**
 * The format an uploaded image starts with: "mobile" in a phone screen's
 * proportions (portrait, 9:14.4 to 9:21.6, at most 1320 px wide like an
 * iPhone Pro Max screenshot), else "desktop". A full-page phone scroll is
 * taller and stays "desktop" until the owner changes it. Migration 0016
 * applies the same rule to earlier uploads.
 */
export function deviceOfImage({ width, height }: { width: number; height: number }): ReferenceDevice {
  return width <= 1320 && height >= width * 1.6 && height <= width * 2.4 ? "mobile" : "desktop";
}

export const maxSourceUrlLength = 2000;
export const maxAttributionLength = 200;
