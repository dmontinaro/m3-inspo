/** Numeric image constraints shared with machine-side capture validation. */
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


export type ImageRejection = "empty" | "tooLarge" | "svg" | "unsupported" | "corrupt" | "tooManyPixels";
