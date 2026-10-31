/**
 * Regions ("Bereiche") shared by the detail view and the server: the owner's
 * names for the component types (@m3-inspo/taxonomy COMPONENT_TYPES) and the
 * size limits of a marked rectangle, in pixels of the capture.
 */

import type { ComponentType } from "@m3-inspo/taxonomy";

/** Component types in the owner's words, in the order the picker shows them. */
export const componentTypeLabels: Record<ComponentType, string> = {
  nav: "Navigation",
  hero: "Hero",
  features: "Features",
  pricing: "Preise",
  cta: "Call to Action",
  testimonial: "Stimmen",
  "logo-cloud": "Logos",
  stat: "Kennzahlen",
  faq: "FAQ",
  footer: "Footer",
};

/** The shortest side a region may have; anything smaller is a slip of the mouse. */
export const minRegionSide = 16;

/** The longest side a region may have: the largest image WebP can hold. */
export const maxRegionSide = 16_383;
