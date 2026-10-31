import type { ImageRejection } from "#/lib/image-limits";
/**
 * Checks an uploaded image and turns it into the files we store. Only PNG,
 * JPEG and WebP get through, recognised by their magic bytes, not by name
 * or declared type. Everything that passes is decoded and re-encoded with
 * sharp, which by default writes no EXIF, XMP, IPTC or embedded profile and
 * nothing else that was hidden in the file.
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Sharp } from "sharp";
import { maxPixels, maxUploadBytes } from "#/lib/image-limits";

type ImageFormat = "png" | "jpeg" | "webp";

type EncodedImage = { data: Buffer; width: number; height: number };

export type PreparedImage = {
  format: ImageFormat;
  /** SHA-256 (hex) of the bytes as uploaded. */
  contentHash: string;
  /** Full size, same format as uploaded, without metadata. */
  original: EncodedImage;
  /** WebP, at most 1600 px wide, for the detail view. */
  preview: EncodedImage;
  /** WebP, 960 × 600 (16:10), cut from the top, for the gallery grid. */
  thumb: EncodedImage;
};

type ImageCheck = { ok: true; image: PreparedImage } | { ok: false; reason: ImageRejection };

export const imageFormats: Record<ImageFormat, { contentType: string; extension: string }> = {
  png: { contentType: "image/png", extension: "png" },
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  webp: { contentType: "image/webp", extension: "webp" },
};

// Re-encodes the full-size original in its own format. PNG stays lossless
// (a `quality` option would switch sharp to a reduced palette).
const encodeOriginal: Record<ImageFormat, (image: Sharp) => Sharp> = {
  png: (image) => image.png(),
  jpeg: (image) => image.jpeg({ quality: 90 }),
  webp: (image) => image.webp({ quality: 90 }),
};

/** Validates the upload and returns the re-encoded original, preview and thumbnail, or a reason to show the owner. */
export async function prepareImage(bytes: Uint8Array): Promise<ImageCheck> {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > maxUploadBytes) return { ok: false, reason: "tooLarge" };

  const format = sniffFormat(bytes);
  if (format === "svg") return { ok: false, reason: "svg" };
  if (!format) return { ok: false, reason: "unsupported" };

  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== format) return { ok: false, reason: "corrupt" };
    if (metadata.width * metadata.height > maxPixels) return { ok: false, reason: "tooManyPixels" };

    // Only the first frame of an animated WebP is kept. autoOrient applies the
    // EXIF rotation before the metadata is dropped.
    // One after another, so a large image is decoded only once at a time.
    const source = sharp(bytes, { limitInputPixels: maxPixels }).autoOrient();
    const original = await encode(encodeOriginal[format](source.clone()));
    const preview = await encode(
      source.clone().resize({ width: 1600, height: 16_000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }),
    );
    const thumb = await encode(
      source.clone().resize({ width: 960, height: 600, fit: "cover", position: "top" }).webp({ quality: 80 }),
    );

    const contentHash = createHash("sha256").update(bytes).digest("hex");
    return { ok: true, image: { format, contentHash, original, preview, thumb } };
  } catch {
    // sharp throws on truncated or otherwise undecodable data.
    return { ok: false, reason: "corrupt" };
  }
}

/** A rectangle in an image's pixels. */
export type PixelRect = { x: number; y: number; width: number; height: number };

/**
 * Cuts `rect` out of a stored capture (bytes as written by `prepareImage`):
 * the crop at full size as WebP, and a small version, at most 640 × 640 px,
 * for inline thumbnails and lists. `rect` must lie within the image.
 */
export async function cropImage(bytes: Uint8Array, rect: PixelRect): Promise<{ crop: EncodedImage; thumb: EncodedImage }> {
  const source = sharp(bytes, { limitInputPixels: maxPixels }).extract({
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  });
  const crop = await encode(source.clone().webp({ quality: 90 }));
  const thumb = await encode(
    source.clone().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }),
  );
  return { crop, thumb };
}

async function encode(pipeline: Sharp): Promise<EncodedImage> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The format the file's first bytes announce. SVG is recognised only to reject it with its own reason. */
function sniffFormat(bytes: Uint8Array): ImageFormat | "svg" | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith([0xff, 0xd8, 0xff])) return "jpeg";
  // "RIFF" <size> "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "webp";

  const head = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (/<svg[\s>]/i.test(head)) return "svg";
  return null;
}
