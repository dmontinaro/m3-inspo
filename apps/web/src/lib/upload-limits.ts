/**
 * Upload limits and rejection reasons, shared by the browser (early
 * feedback before sending) and the server (the real check).
 */
export const maxUploadBytes = 25 * 1024 * 1024;
export const maxUploadMegabytes = maxUploadBytes / 1024 / 1024;

/**
 * Upper bound for decoded pixels (width × height). Stops decompression
 * bombs and keeps sharp's memory in check (40 MP ≈ 160 MB raw RGBA). A
 * full-page desktop screenshot of 1440 × 16,000 px is 23 MP.
 */
export const maxPixels = 40_000_000;
export const maxMegapixels = maxPixels / 1_000_000;

export const maxTitleLength = 200;
export const maxNoteLength = 5000;

/** File types the upload accepts; the server checks the magic bytes, not this type. */
export const acceptedImageTypes = "image/png,image/jpeg,image/webp";

// A retina-width screenshot that just fits the pixel limit, e.g. 2.880 × 13.800 px for 40 MP.
const pixelExample = { width: 2880, height: Math.floor(maxPixels / 2880 / 100) * 100 };
const germanNumber = new Intl.NumberFormat("de-DE");

/** Why an image was turned away, in German for the owner. */
export const rejectionReasons = {
  empty: "Die Datei ist leer.",
  tooLarge: `Die Datei ist größer als ${maxUploadMegabytes} MB. Speichere sie kleiner oder als JPEG bzw. WebP.`,
  svg: "SVG-Dateien werden nicht angenommen. Lade das Bild als PNG, JPEG oder WebP hoch.",
  unsupported: "Dieses Dateiformat wird nicht unterstützt. Erlaubt sind PNG, JPEG und WebP.",
  corrupt: "Die Datei ist beschädigt und lässt sich nicht als Bild öffnen.",
  tooManyPixels: `Das Bild ist zu groß. Erlaubt sind höchstens ${maxMegapixels} Megapixel, zum Beispiel ${germanNumber.format(pixelExample.width)} × ${germanNumber.format(pixelExample.height)} px.`,
};
