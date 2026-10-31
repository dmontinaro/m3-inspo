/**
 * The worker's only way out: the web app's worker API
 * (apps/web/src/routes/api/worker/$.ts), authenticated with WORKER_TOKEN.
 * The worker holds no database or bucket credentials; captures go to the
 * upload URLs the API hands out.
 *
 * ```ts
 * const api = createWorkerApi(process.env.INSPO_API_URL, process.env.WORKER_TOKEN);
 * const job = await api.claim();
 * ```
 */

import type { Mode } from "@m3-inspo/taxonomy";
import type { PageTokens } from "@m3-inspo/shared";
import { z } from "zod";

const claimedJob = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("url_capture"), attempt: z.number(), input: z.object({ url: z.string() }) }),
  z.object({ id: z.string(), kind: z.literal("font_preview"), attempt: z.number(), input: z.object({ pageUrl: z.string() }) }),
]);

/**
 * A job the worker holds: `attempt` proves it in every later call. A
 * `url_capture` job imports a page as a reference, a `font_preview` job
 * captures a font's page as its preview.
 */
export type ClaimedJob = z.infer<typeof claimedJob>;

/** What `complete` reports: the uploaded captures and what was read from the page (URL imports only). */
export type Completion = {
  pageTitle?: string;
  captures: { uploadId: string; viewport: "desktop" | "mobile"; kind: "hero" | "full" }[];
  tokens?: PageTokens;
  tech?: string[];
  mode?: Mode;
};

export type WorkerApi = {
  /** The next queued job of a kind this worker knows, or null when there is none. */
  claim: () => Promise<ClaimedJob | null>;
  /** Extends the lease and reports the stage, e.g. "capturing". Throws `JobLostError` once the job is not held any more. */
  heartbeat: (job: ClaimedJob, stage?: string) => Promise<void>;
  /** `count` upload targets for the job's captures. */
  uploadTargets: (job: ClaimedJob, count: number) => Promise<{ id: string; url: string }[]>;
  /** PUTs one capture to an upload target's URL. */
  upload: (url: string, bytes: Uint8Array) => Promise<void>;
  complete: (job: ClaimedJob, completion: Completion) => Promise<void>;
  /** Reports the job as failed; the server stores `error` cleaned. */
  fail: (job: ClaimedJob, error: string) => Promise<void>;
};

/** The API answered 409: the job's lease ran out or it was claimed again, so this worker must drop it. */
export class JobLostError extends Error {
  constructor() {
    super("The job is not held by this worker any more.");
    this.name = "JobLostError";
  }
}

const uploadTargets = z.object({ uploads: z.array(z.object({ id: z.string(), url: z.string() })) });

/** Each call gives up after this long, so a hanging API cannot stall the loop. */
const requestTimeoutMs = 30_000;

/**
 * The worker API at `baseUrl` (INSPO_API_URL). Upload URLs may be relative
 * (the folder storage in development); they resolve against `baseUrl`.
 */
export function createWorkerApi(baseUrl: string, token: string): WorkerApi {
  const authorization = `Bearer ${token}`;

  async function post(path: string, body: unknown = {}) {
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (response.status === 409) throw new JobLostError();
    if (!response.ok) throw new Error(`Worker API ${path.replace(/[0-9a-f-]{36}/, ":id")} answered ${response.status}.`);
    return response.json() as Promise<unknown>;
  }

  const jobPath = (job: ClaimedJob, action: string) => `/api/worker/jobs/${job.id}/${action}`;

  return {
    claim: async () =>
      z.object({ job: claimedJob.nullable() }).parse(await post("/api/worker/claim", { kinds: ["url_capture", "font_preview"] })).job,
    heartbeat: async (job, stage) => {
      await post(jobPath(job, "heartbeat"), { attempt: job.attempt, stage });
    },
    uploadTargets: async (job, count) =>
      uploadTargets.parse(await post(jobPath(job, "uploads"), { attempt: job.attempt, count })).uploads,
    upload: async (url, bytes) => {
      // No token: the URL is signed. fetch sends the Content-Length the API requires.
      const response = await fetch(new URL(url, baseUrl), {
        method: "PUT",
        // A copy on its own ArrayBuffer, which is what fetch takes (a Buffer may share a pooled one).
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (response.status === 409) throw new JobLostError();
      if (!response.ok) throw new Error(`Upload answered ${response.status}.`);
    },
    complete: async (job, completion) => {
      await post(jobPath(job, "complete"), { attempt: job.attempt, ...completion });
    },
    fail: async (job, error) => {
      await post(jobPath(job, "fail"), { attempt: job.attempt, error });
    },
  };
}
