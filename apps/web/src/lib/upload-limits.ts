import { formatNumber } from "./format";
import * as m from "#/paraglide/messages.js";
/**
 * Upload limits and rejection reasons, shared by the browser (early
 * feedback before sending) and the server (the real check).
 */
import { maxUploadMegabytes, maxPixels, maxMegapixels } from "./image-limits";

export * from "./image-limits";

// A retina-width screenshot that just fits the pixel limit, e.g. 2.880 × 13.800 px for 40 MP.
const pixelExample = { width: 2880, height: Math.floor(maxPixels / 2880 / 100) * 100 };
/** Rejection text is evaluated in the current request or browser. */
export const rejectionReasons = {
  get empty() { return m.upload_empty(); },
  get tooLarge() { return m.upload_too_large({ max: formatNumber(maxUploadMegabytes) }); },
  get svg() { return m.upload_svg(); },
  get unsupported() { return m.upload_unsupported(); },
  get corrupt() { return m.upload_corrupt(); },
  get tooManyPixels() { return m.upload_too_many_pixels({ max: formatNumber(maxMegapixels), width: formatNumber(pixelExample.width), height: formatNumber(pixelExample.height) }); },
};
