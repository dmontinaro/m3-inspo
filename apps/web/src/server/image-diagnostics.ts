import { maxPixels, maxMegapixels, maxUploadMegabytes } from "#/lib/image-limits";

// A retina-width screenshot that just fits the pixel limit, e.g. 2.880 × 13.800 px for 40 MP.
const pixelExample = { width: 2880, height: Math.floor(maxPixels / 2880 / 100) * 100 };
const germanNumber = new Intl.NumberFormat("de-DE");

/** Existing machine diagnostics, independent of browser language. */
export const imageDiagnostics = {
  empty: "Die Datei ist leer.",
  tooLarge: `Die Datei ist größer als ${maxUploadMegabytes} MB. Speichere sie kleiner oder als JPEG bzw. WebP.`,
  svg: "SVG-Dateien werden nicht angenommen. Lade das Bild als PNG, JPEG oder WebP hoch.",
  unsupported: "Dieses Dateiformat wird nicht unterstützt. Erlaubt sind PNG, JPEG und WebP.",
  corrupt: "Die Datei ist beschädigt und lässt sich nicht als Bild öffnen.",
  tooManyPixels: `Das Bild ist zu groß. Erlaubt sind höchstens ${maxMegapixels} Megapixel, zum Beispiel ${germanNumber.format(pixelExample.width)} × ${germanNumber.format(pixelExample.height)} px.`,
};
