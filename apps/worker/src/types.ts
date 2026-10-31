import type { Mode } from "@m3-inspo/taxonomy";
import type { PageTokens } from "@m3-inspo/shared";

/** The two viewports the worker captures: desktop at 1x and a phone at 2x. */
export type Viewport = "desktop" | "mobile";

export const VIEWPORT_SIZES: Record<Viewport, { width: number; height: number; deviceScaleFactor: number }> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 375, height: 812, deviceScaleFactor: 2 },
};

/** What extract.ts reads from the loaded desktop page. */
export type ExtractedMetadata = {
  tokens: PageTokens;
  tech: string[];
  mode: Mode;
  pageTitle: string;
};
