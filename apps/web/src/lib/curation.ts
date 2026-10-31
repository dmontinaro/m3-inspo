import * as m from "#/paraglide/messages.js";
/**
 * Curation vocabulary shared by the detail view, the gallery filters and the
 * server: statuses, focus areas, formats and field limits. Stored values are English
 * keys (agents read them in `taste`); the labels are what the owner sees.
 */

import type { CurationStatus, ReferenceDevice } from "@m3-inspo/db/library-schema";

export const curationStatuses = ["draft", "approved", "archived"] as const satisfies readonly CurationStatus[];

export const statusLabels: Record<CurationStatus, string> = {
  get draft() { return m.status_draft(); },
  get approved() { return m.status_approved(); },
  get archived() { return m.status_archived(); },
};

/** What a reference is about: the whole page or one area of it. Stored in `references.focus`. */
export const focusAreas = ["page", "hero", "navigation", "form", "pricing", "footer"] as const;
export type FocusArea = (typeof focusAreas)[number];

export const focusLabels: Record<FocusArea, string> = {
  get page() { return m.focus_page(); },
  get hero() { return m.component_hero(); },
  get navigation() { return m.component_nav(); },
  get form() { return m.focus_form(); },
  get pricing() { return m.component_pricing(); },
  get footer() { return m.component_footer(); },
};

/** A reference's format ("Format"): made for a desktop screen or a phone. Stored in `references.device`. */
export const devices = ["desktop", "mobile"] as const satisfies readonly ReferenceDevice[];

export const deviceLabels: Record<ReferenceDevice, string> = {
  get desktop() { return m.device_desktop(); },
  get mobile() { return m.device_mobile(); },
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
