/**
 * The web app's job runner: one loop that works through the jobs the web app
 * runs itself, one at a time. AI analyses (analysis.server.ts) go first,
 * since each one queues an embedding refresh; then embeddings
 * (embedding.server.ts). Either part is off when its key is missing.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { runNextAnalysis } from "./analysis.server";
import type { VisionModel } from "./analysis-model.server";
import { queueMissingEmbeddings, runNextEmbedding } from "./embedding.server";

/** The pause before looking at empty queues again. */
const idleMs = 5_000;

/**
 * Starts the loop: `vision` runs analysis jobs (null: analysis off),
 * `embeddings` says whether embedding jobs run; then it first queues the
 * embeddings that are missing (`queueMissingEmbeddings`). Pauses briefly whenever both
 * queues are empty or the database is unreachable. Returns `stop`, which
 * ends the loop and aborts a running model request.
 */
export function startJobRunner({ vision, embeddings }: { vision: VisionModel | null; embeddings: boolean }) {
  const controller = new AbortController();
  const pause = () => sleep(idleMs, undefined, { signal: controller.signal }).catch(() => {});
  console.info(`[jobs] runner started: analysis ${vision?.model ?? "off"}, embeddings ${embeddings ? "on" : "off"}`);

  const loop = (async () => {
    if (embeddings) {
      const backfilled = await queueMissingEmbeddings().catch((error: unknown) => {
        console.error(`[jobs] embedding backfill failed: ${error instanceof Error ? error.name : typeof error}`);
        return 0;
      });
      if (backfilled > 0) console.info(`[jobs] queued ${backfilled} missing embeddings`);
    }
    while (!controller.signal.aborted) {
      try {
        const worked =
          (vision !== null && (await runNextAnalysis(vision, controller.signal))) ||
          (embeddings && (await runNextEmbedding()));
        if (!worked) await pause();
      } catch (error) {
        console.error(`[jobs] runner error: ${error instanceof Error ? error.name : typeof error}`);
        await pause();
      }
    }
  })();

  return async () => {
    controller.abort();
    await loop;
  };
}
