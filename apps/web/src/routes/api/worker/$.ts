import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  claimJob,
  completeJob,
  createUploadTargets,
  failJob,
  renewLease,
  stagedUploadState,
  workerKinds,
} from "#/server/import-jobs.server";
import type { Refusal } from "#/server/import-jobs.server";
import { getStorage, isSignedUpload, isValidKey } from "#/server/storage.server";
import { authenticateWorker } from "#/server/worker-auth.server";
import { maxUploadBytes } from "#/lib/upload-limits";

/** Job actions: `POST jobs/<id>/<action>` with a JSON body that carries the claim's `attempt`. */
const jobActions = new Map<string, (id: string, body: unknown) => Promise<{ ok: true } | Refusal>>([
  ["heartbeat", renewLease],
  ["uploads", createUploadTargets],
  ["complete", completeJob],
  ["fail", failJob],
]);

const refusalStatus = { invalid: 400, notFound: 404, conflict: 409, rejected: 422 } as const;

/** A worker from before font previews sends no body, so it only gets URL imports. */
const claimRequest = z.object({ kinds: z.array(z.enum(workerKinds)).min(1).default(["url_capture"]) });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * One exchange with the capture worker. Every call needs the worker token,
 * except the folder storage's signed upload URLs (`PUT objects/<key>`); the
 * session cookie never counts, so no CSRF check is needed either: browsers do
 * not add an Authorization header on their own.
 *
 * - `POST claim` `{ kinds? }` → `{ job: { id, kind, attempt, leaseExpiresAt, input } | null }`; `kinds` lists
 *   the job kinds the worker knows (`url_capture`, `font_preview`), only `url_capture` without it.
 * - `POST jobs/<id>/heartbeat` `{ attempt, stage? }` → `{ ok, leaseExpiresAt }`
 * - `POST jobs/<id>/uploads` `{ attempt, count }` → `{ ok, uploads: [{ id, url, method: "PUT" }] }`;
 *   a relative `url` is on this app.
 * - `POST jobs/<id>/complete` `{ attempt, pageTitle?, captures: [{ uploadId, viewport, kind }] }` → `{ ok, referenceSlug? }`;
 *   a `font_preview` job sends one desktop hero capture and gets no slug.
 * - `POST jobs/<id>/fail` `{ attempt, error }` → `{ ok }`; the error is stored cleaned.
 *
 * Refusals answer `{ error }` with 400 (bad body), 404 (unknown job), 409
 * (not held by this attempt) or 422 (refused capture).
 */
async function serveWorker({ request, params }: { request: Request; params: { _splat?: string } }) {
  // Lowercase and without empty segments, like the router's own matching.
  const segments = (params._splat ?? "").toLowerCase().split("/").filter(Boolean);

  if (request.method === "PUT" && segments[0] === "objects") return receiveUpload(request, segments.slice(1).join("/"));

  if (!authenticateWorker(request.headers)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer realm="inspo-worker"' } });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  if (segments.join("/") === "claim") {
    const claim = claimRequest.safeParse(await request.json().catch(() => ({})));
    if (!claim.success) return Response.json({ error: z.prettifyError(claim.error) }, { status: 400 });
    return Response.json({ job: await claimJob(claim.data.kinds) });
  }

  const [resource, id = "", action = ""] = segments;
  const run = jobActions.get(action);
  if (resource !== "jobs" || segments.length !== 3 || !uuidPattern.test(id) || !run) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const outcome = await run(id, await request.json().catch(() => undefined));
  if (!outcome.ok) return Response.json({ error: outcome.message }, { status: refusalStatus[outcome.problem] });
  return Response.json(outcome);
}

/**
 * Takes an upload to a signed URL of the folder storage (development and
 * tests); with S3, the worker uploads straight to the bucket instead. Needs a
 * Content-Length within the upload limit, checked before the body is read,
 * and only while the attempt the URL was issued for still holds its job.
 */
async function receiveUpload(request: Request, key: string) {
  const url = new URL(request.url);
  const signed =
    isValidKey(key) && isSignedUpload(key, url.searchParams.get("expires") ?? "", url.searchParams.get("signature") ?? "");
  if (!signed) return new Response("Forbidden", { status: 403 });

  const announced = request.headers.get("content-length");
  if (announced === null) return new Response("Length Required", { status: 411 });
  if (Number(announced) > maxUploadBytes) return new Response("Payload Too Large", { status: 413 });

  const state = await stagedUploadState(key);
  if (state === "unknown") return new Response("Forbidden", { status: 403 });
  if (state === "closed") return Response.json({ error: "The job is not held by this attempt any more." }, { status: 409 });

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > maxUploadBytes) return new Response("Payload Too Large", { status: 413 });
  await getStorage().write(key, body, "application/octet-stream");
  return new Response(null, { status: 200 });
}

/**
 * The worker API. The global gate in src/start.ts leaves every path under
 * /api/worker to this handler's own checks, so it takes every method: one
 * without a handler would fall through to page rendering, unchecked.
 */
export const Route = createFileRoute("/api/worker/$")({
  server: { handlers: { ANY: serveWorker } },
});
