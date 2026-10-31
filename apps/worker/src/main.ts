/**
 * The capture worker: claims jobs from the web app's worker API one at a
 * time and processes them (process-job.ts). Needs only INSPO_API_URL and
 * WORKER_TOKEN; no database or bucket credentials.
 *
 *   INSPO_API_URL=https://library.example.com WORKER_TOKEN=… pnpm --filter @m3-inspo/worker start
 *
 * Idle, it polls every 5 s, backing off to 30 s. SIGTERM or SIGINT stops
 * claiming and lets the current job finish (its time budget bounds that);
 * a second signal, or 90 s without it finishing, aborts it without
 * reporting: its lease runs out and the web app hands it out again.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { createWorkerApi } from "./api.ts";
import { chromiumSandbox, firstLine } from "./capture.ts";
import { processJob } from "./process-job.ts";

const idleMinMs = 5_000;
const idleMaxMs = 30_000;
const shutdownGraceMs = 90_000;

const apiUrl = process.env.INSPO_API_URL ?? "";
const token = process.env.WORKER_TOKEN ?? "";
if (!URL.canParse(apiUrl) || token.length < 32) {
  console.error("Set INSPO_API_URL (the web app's URL) and WORKER_TOKEN (at least 32 characters).");
  process.exit(1);
}

const api = createWorkerApi(apiUrl, token);
/** Aborted on the first signal: no more claims. */
const draining = new AbortController();
/** Aborted on the second signal or after the grace period: the current job stops. */
const shutdown = new AbortController();

/** Resolves after `ms`, or early when the worker starts draining. */
const pause = (ms: number) => sleep(ms, undefined, { signal: draining.signal }).catch(() => {});

function stop(signal: string) {
  if (draining.signal.aborted) {
    console.log(`${signal} again: aborting the current job.`);
    shutdown.abort();
    return;
  }
  console.log(`${signal}: finishing the current job, then stopping.`);
  draining.abort();
  setTimeout(() => shutdown.abort(), shutdownGraceMs).unref();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

console.log(`Capture worker polling ${new URL(apiUrl).origin}, Chromium sandbox ${chromiumSandbox ? "on" : "off"}.`);
let idleMs = idleMinMs;
while (!draining.signal.aborted) {
  try {
    const job = await api.claim();
    if (!job) {
      await pause(idleMs);
      idleMs = Math.min(idleMs * 2, idleMaxMs);
      continue;
    }
    idleMs = idleMinMs;
    const started = Date.now();
    const url = job.kind === "font_preview" ? job.input.pageUrl : job.input.url;
    console.log(`Job ${job.id} (${job.kind}, attempt ${job.attempt}): ${new URL(url).host}`);
    const outcome = await processJob(job, api, { signal: shutdown.signal });
    console.log(`Job ${job.id}: ${outcome} after ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (error) {
    // The API is down or answered unexpectedly: wait and try again.
    console.warn(`Worker API: ${firstLine(error)}`);
    await pause(idleMaxMs);
  }
}
console.log("Capture worker stopped.");
