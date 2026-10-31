/**
 * One claimed job from start to finish: check the URL, capture the page (a
 * URL import in full, a font preview as its desktop hero only), upload the
 * captures and report the result, or report why it failed. Heartbeats keep
 * the lease while it runs.
 *
 * ```ts
 * const outcome = await processJob(job, api);                       // "ready" | "failed" | "lost" | "abandoned"
 * await processJob(job, api, { checkUrl, pageBudgetMs: 5_000 });    // tests: a looser guard, a shorter budget
 * ```
 */

import { assertPublicUrl, resolveHost } from "@m3-inspo/shared/public-url";
import type { Resolve } from "@m3-inspo/shared/public-url";
import { JobLostError } from "./api.ts";
import type { ClaimedJob, WorkerApi } from "./api.ts";
import { CaptureError, captureFontPage, capturePage, firstLine } from "./capture.ts";
import type { CaptureOptions } from "./capture.ts";
import type { CheckUrl } from "./guard-proxy.ts";
import type { Shot } from "./screenshot.ts";
import type { ExtractedMetadata } from "./types.ts";

export type ProcessOptions = {
  /** The URL guard for the start URL and every request of the page. Default: `assertPublicUrl` with a per-job DNS cache. */
  checkUrl?: CheckUrl;
  /** Time for checking, loading and capturing the page (docs/spec.md: 45 s). */
  pageBudgetMs?: number;
  /** How often the lease is renewed while the job runs. */
  heartbeatMs?: number;
  /** Aborting (the worker shuts down) stops the capture without reporting: the lease runs out and the job is handed out again. */
  signal?: AbortSignal;
};

export type JobOutcome = "ready" | "failed" | "lost" | "abandoned";

/** The longest error message sent; the server cleans and shortens again. */
const maxErrorLength = 300;

export async function processJob(job: ClaimedJob, api: WorkerApi, options: ProcessOptions = {}): Promise<JobOutcome> {
  const { pageBudgetMs = 45_000, heartbeatMs = 30_000, signal } = options;
  // One DNS lookup per host for the whole job; the proxy connects to what the guard returned either way.
  const resolve = cachedResolver(resolveHost);
  const checkUrl = options.checkUrl ?? ((url: string) => assertPublicUrl(url, resolve));

  let lost = false;
  let stage: string | undefined;
  // Stage timings in the log show where a slow or failing job spends its time; no URLs or secrets.
  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)} s`;
  const beat = () =>
    api.heartbeat(job, stage).catch((error: unknown) => {
      if (error instanceof JobLostError) lost = true;
      else console.warn(`  heartbeat failed: ${firstLine(error)}`);
    });
  const enter = (next: string) => {
    stage = next;
    console.log(`  ${elapsed()}: ${next}`);
    void beat();
  };
  const heartbeat = setInterval(() => void beat(), heartbeatMs);

  try {
    const within = { checkUrl, budgetMs: pageBudgetMs, signal, onStage: enter };
    const { shots, ...metadata }: { shots: Shot[] } & Partial<ExtractedMetadata> =
      job.kind === "font_preview"
        ? { shots: await captureWithin(job.input.pageUrl, captureFontPage, within) }
        : await captureWithin(job.input.url, capturePage, within);
    if (lost) return "lost";

    enter("uploading");
    const targets = await api.uploadTargets(job, shots.length);
    for (const [index, shot] of shots.entries()) {
      const target = targets[index];
      if (!target) throw new Error("The worker API issued too few upload targets.");
      await api.upload(target.url, shot.png);
    }
    const { pageTitle, tokens, tech, mode } = metadata;
    await api.complete(job, {
      ...(pageTitle?.trim() && { pageTitle: pageTitle.slice(0, 2000) }),
      captures: shots.map((shot, index) => ({ uploadId: targets[index]!.id, viewport: shot.viewport, kind: shot.kind })),
      tokens,
      tech,
      mode,
    });
    return "ready";
  } catch (error) {
    // Lost covers a lost `complete` answer too: its retry through `fail` then finds the job finished (409).
    if (lost || error instanceof JobLostError) return "lost";
    // Not the page's fault: no final failure, so the job is handed out again once its lease runs out.
    if (signal?.aborted) return "abandoned";
    console.warn(`  ${elapsed()}: failed during ${stage ?? "start"}: ${firstLine(error).slice(0, maxErrorLength)}`);
    try {
      await api.fail(job, firstLine(error).slice(0, maxErrorLength) || "Unknown error.");
      return "failed";
    } catch (failError) {
      if (failError instanceof JobLostError) return "lost";
      throw failError;
    }
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Checks the start URL and captures the page with `capture`, both within
 * `budgetMs` from now. Past the budget, or once `signal` aborts, it throws a
 * `CaptureError` saying so.
 */
async function captureWithin<T>(
  url: string,
  capture: (url: string, options: CaptureOptions) => Promise<T>,
  options: { checkUrl: CheckUrl; budgetMs: number; signal?: AbortSignal; onStage: (stage: string) => void },
): Promise<T> {
  const { checkUrl, budgetMs, signal, onStage } = options;
  const deadline = Date.now() + budgetMs;
  const budget = AbortSignal.timeout(budgetMs);
  const stop = signal ? AbortSignal.any([signal, budget]) : budget;
  try {
    await untilAborted(checkUrl(url), stop);
    return await capture(url, { checkUrl, deadline, signal: stop, onStage });
  } catch (error) {
    if (budget.aborted) throw new CaptureError(`The page did not finish within ${Math.round(budgetMs / 1000)} seconds.`);
    if (signal?.aborted) throw new CaptureError("The worker stopped during the capture.");
    throw error;
  }
}

/** `promise`, or a rejection with the signal's reason as soon as `signal` aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.throwIfAborted();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
}

/**
 * `resolve` with a cache for one job: a page loads many resources from few
 * hosts, so one lookup per host is enough.
 */
function cachedResolver(resolve: Resolve): Resolve {
  const answers = new Map<string, Promise<string[]>>();
  return (hostname) => {
    let answer = answers.get(hostname);
    if (!answer) {
      answer = resolve(hostname);
      answers.set(hostname, answer);
    }
    return answer;
  };
}
