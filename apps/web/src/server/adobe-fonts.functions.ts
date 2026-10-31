import { createServerFn } from "@tanstack/react-start";
import { adobeFontsEnabled, previewKitId } from "./adobe-fonts.server";

/**
 * The Adobe preview kit's id for the font previews (components/font-faces.tsx),
 * null without ADOBE_FONTS_API_TOKEN or while Adobe does not answer.
 */
export const getAdobePreviewKitId = createServerFn({ method: "GET" }).handler(async () => {
  if (!adobeFontsEnabled()) return null;
  return previewKitId().catch((error: unknown) => {
    console.warn("[adobe-fonts] no preview kit:", error);
    return null;
  });
});
