/**
 * Access for the capture worker. It runs in a Railway project of its own and
 * holds only `WORKER_TOKEN`, sent as `Authorization: Bearer <token>` to the
 * worker API (routes/api/worker/$.ts). Session cookies never count there.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** Where the worker API lives. */
export const workerApiPath = "/api/worker";

/** Shorter tokens are refused, so a placeholder left in the environment opens nothing. */
const minTokenLength = 32;

/**
 * Whether the router would send `pathname` to the worker API. It matches
 * case-insensitively and ignores repeated and trailing slashes, so
 * `/API/WORKER/claim` and `/api/worker//claim/` count as well.
 */
export function isWorkerPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized === workerApiPath || normalized.startsWith(`${workerApiPath}/`);
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether the request carries the worker token. Compared in constant time
 * (over SHA-256 digests, which have equal length); without a configured
 * token of at least 32 characters the worker API stays closed.
 */
export function authenticateWorker(headers: Headers): boolean {
  const expected = process.env.WORKER_TOKEN ?? "";
  const given = /^Bearer (\S+)$/i.exec(headers.get("authorization") ?? "")?.[1];
  if (expected.length < minTokenLength || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}
