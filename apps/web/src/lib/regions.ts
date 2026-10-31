import * as m from "#/paraglide/messages.js";
/**
 * Regions ("Bereiche") shared by the detail view and the server: the owner's
 * names for the component types (@m3-inspo/taxonomy COMPONENT_TYPES) and the
 * size limits of a marked rectangle, in pixels of the capture.
 */

import type { ComponentType } from "@m3-inspo/taxonomy";

/** Component types in the owner's words, in the order the picker shows them. */
export const componentTypeLabels: Record<ComponentType, string> = {
  get nav() { return m.component_nav(); },
  get hero() { return m.component_hero(); },
  get features() { return m.component_features(); },
  get pricing() { return m.component_pricing(); },
  get cta() { return m.component_cta(); },
  get testimonial() { return m.component_testimonial(); },
  get "logo-cloud"() { return m.component_logos(); },
  get stat() { return m.component_stats(); },
  get faq() { return m.component_faq(); },
  get footer() { return m.component_footer(); },
};

/** The shortest side a region may have; anything smaller is a slip of the mouse. */
export const minRegionSide = 16;

/** The longest side a region may have: the largest image WebP can hold. */
export const maxRegionSide = 16_383;
