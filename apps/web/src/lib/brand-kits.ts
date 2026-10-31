import type { BrandKitStatus } from "@m3-inspo/db/library-schema";

/** Field limits of a Brand Kit, shared by the save dialog, the notes editor and the server check. */
export const maxBrandKitNameLength = 120;
export const maxBrandKitNotesLength = 4000;
export const maxDesignBriefingLength = 40_000;

/**
 * Every status of a kit, in the order the kit page's status switch shows
 * them; the server checks status changes against this list too. Labels are
 * `statusLabels` (lib/curation).
 */
export const brandKitStatuses = ["draft", "approved", "archived"] as const satisfies readonly BrandKitStatus[];

// A status added to the enum but missing above fails to compile here.
true satisfies [Exclude<BrandKitStatus, (typeof brandKitStatuses)[number]>] extends [never] ? true : never;
