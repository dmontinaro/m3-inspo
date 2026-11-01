import * as m from "#/paraglide/messages.js";
import { webValidator } from "#/lib/validation";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listJobs, queueUrlImport, retryJob } from "./import-jobs.server";

/** Server functions for URL imports and the job list. The global owner gate has already let the caller in. */

/**
 * The upload page's import form: `requestId` (one per submission), `url`, and
 * optionally `title`, `takeNote`, `avoidNote`, one `tags` entry per tag and
 * `confirmDuplicate=1` once the owner chose to import a known page again.
 * Answers `{ ok: false, reason, duplicate? }` with a localized reason when rejected.
 */
export const createUrlImport = createServerFn({ method: "POST" })
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error(m.validation_invalid_input());
    return data;
  })
  .handler(({ data }) => {
    const text = (name: string) => String(data.get(name) ?? "");
    return queueUrlImport({
      requestId: text("requestId"),
      url: text("url"),
      title: text("title"),
      takeNote: text("takeNote"),
      avoidNote: text("avoidNote"),
      tags: data.getAll("tags"),
      confirmDuplicate: text("confirmDuplicate") === "1",
    });
  });

/** The newest jobs first, with stage, attempts, sanitized error and the created draft. */
export const listImportJobs = createServerFn({ method: "GET" }).handler(() => listJobs());


/** "Erneut versuchen": puts a failed job back into the queue. False if it is not failed (any more). */
export const retryImportJob = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ id: z.uuid() })))
  .handler(({ data }) => retryJob(data.id));
