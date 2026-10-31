/**
 * The generator's pipette: which pixel of a reference's original image a
 * click into its enlarged view means, and a preview of its colour while
 * the mouse moves. The take itself reads the original on the server
 * (`readImagePixel`), exact whatever the browser does to the image.
 *
 * ```ts
 * const box = image.getBoundingClientRect();
 * const { x, y } = naturalPixel({ x: event.clientX - box.left, y: event.clientY - box.top }, box, { width: image.naturalWidth, height: image.naturalHeight });
 * const hex = await readImagePixel({ data: { image: imageUrl, x, y } });
 * ```
 */

type Size = { width: number; height: number };

/** The original's pixel under a point given in CSS pixels from the displayed image's top-left corner. */
export function naturalPixel(point: { x: number; y: number }, shown: Size, natural: Size) {
  const scale = (value: number, from: number, to: number) => Math.min(to - 1, Math.max(0, Math.floor((value / from) * to)));
  return { x: scale(point.x, shown.width, natural.width), y: scale(point.y, shown.height, natural.height) };
}

/** Reads the colour (hex) of pixel `x`, `y` of a loaded image. */
export type PixelReader = (image: HTMLImageElement, x: number, y: number) => string;

/**
 * A reader for the hover preview, on one reusable 1×1 canvas: it copies
 * just that pixel, unscaled, so a large image never needs a canvas of its
 * size. The value is the sRGB colour as the browser shows the image (after
 * its decoding and colour management), so only near the original; a
 * transparent pixel reads as on white. Throws without a 2D canvas, and on
 * reading an image the canvas may not read.
 */
export function pixelReader(): PixelReader {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is not available.");
  context.imageSmoothingEnabled = false;
  return (image, x, y) => {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1, 1);
    context.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  };
}
