/** Browser-side helpers for files the owner pastes, drops or picks before they go to `uploadImage`. */

import { acceptedImageTypes, maxUploadBytes, rejectionReasons } from "./upload-limits";

/**
 * A quick check before sending, by declared type and size only, so an
 * obviously wrong file is turned away at once with the server's own reason.
 * `null` means "send it": the server still checks the actual bytes.
 */
export function precheckFile(file: Pick<File, "type" | "size">): string | null {
  if (file.size === 0) return rejectionReasons.empty;
  if (file.size > maxUploadBytes) return rejectionReasons.tooLarge;
  if (file.type === "image/svg+xml") return rejectionReasons.svg;
  // No declared type (unknown extension): let the server look at the bytes.
  if (file.type && !acceptedImageTypes.split(",").includes(file.type)) return rejectionReasons.unsupported;
  return null;
}

/** "hotel-alpenrose_startseite.png" → "hotel alpenrose startseite" */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

const pasteTimeFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Default title for a pasted image, which has no useful file name: "Screenshot 23.09.2026, 14:07". */
export function screenshotTitle(pastedAt: Date): string {
  return `Screenshot ${pasteTimeFormat.format(pastedAt)}`;
}
