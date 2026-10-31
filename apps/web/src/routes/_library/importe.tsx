import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ImportJobStatus } from "@m3-inspo/db/library-schema";
import { listImportJobs, retryImportJob } from "#/server/import-jobs.functions";

export const Route = createFileRoute("/_library/importe")({
  head: () => ({ meta: [{ title: "Importe · m3 inspo" }] }),
  loader: () => listImportJobs(),
  component: Imports,
});

type ListedJob = Awaited<ReturnType<typeof listImportJobs>>[number];

/** How often the list looks again while a job is waiting or running. */
const refreshMs = 5000;

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

const statusBadges: Record<ImportJobStatus, { label: string; className: string; dot: string }> = {
  queued: { label: "Wartet auf den Worker", className: "bg-neutral-100 text-neutral-700 ring-neutral-500/20", dot: "bg-neutral-400" },
  processing: { label: "Läuft", className: "bg-sky-50 text-sky-800 ring-sky-600/20", dot: "animate-pulse bg-sky-500" },
  ready: { label: "Fertig", className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", dot: "bg-emerald-500" },
  failed: { label: "Fehlgeschlagen", className: "bg-rose-50 text-rose-700 ring-rose-600/20", dot: "bg-rose-500" },
};

const kindLabels: Record<ListedJob["kind"], string> = {
  url_capture: "Website",
  analysis: "Analyse",
  embedding: "Embedding",
  font_preview: "Schriftvorschau",
};

/** The worker's stages in the owner's words; unknown ones show as sent. */
const stageLabels: Record<string, string> = {
  capturing: "Aufnahme",
  extracting: "Werte auslesen",
  uploading: "Hochladen",
};

// Every import job, newest first: what it imports, where it stands and, once ready,
// a link to its draft. Failed jobs show their cleaned error and can be retried.
// While a job waits or runs, the list refreshes itself.
function Imports() {
  const jobs = Route.useLoaderData();
  const router = useRouter();
  const active = jobs.some((job) => job.status === "queued" || job.status === "processing");

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void router.invalidate(), refreshMs);
    return () => clearInterval(timer);
  }, [active, router]);

  return (
    <main className="mx-auto max-w-3xl px-5 pt-2 pb-16 sm:px-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> Galerie
      </Link>
      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Importe</h1>
        <Link
          to="/hochladen"
          hash="website"
          className="shrink-0 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
        >
          Website importieren
        </Link>
      </div>
      <p className="mt-1 max-w-prose text-[15px] text-neutral-600">
        Website-Importe übernimmt der Capture-Worker. Solange er nicht läuft, warten neue Importe hier. Fertige Importe
        landen als Entwurf in der Galerie.
      </p>

      {jobs.length === 0 ? (
        <p className="mt-8 text-[15px] text-neutral-500">Noch keine Importe.</p>
      ) : (
        <ul className="mt-8 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>
      )}
    </main>
  );
}

function JobRow({ job }: { job: ListedJob }) {
  const address = URL.parse(job.url);
  const place = address ? `${address.hostname}${address.pathname === "/" ? "" : address.pathname}` : job.url;
  const badge = statusBadges[job.status];
  const stage = job.status === "processing" && job.stage ? (stageLabels[job.stage] ?? job.stage) : null;

  return (
    // Wide screens: the action sits right of the title. Phones: it goes last, so the title keeps the full width.
    <li className="grid gap-x-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
      <div className="min-w-0">
        <p className="truncate font-medium text-neutral-900">{job.title ?? place}</p>
        <p className="mt-0.5 truncate text-sm text-neutral-500">{job.title ? place : job.url}</p>
      </div>
      {(job.status === "ready" || job.status === "failed") && (
        <div className="max-sm:order-last max-sm:mt-3">
          <JobAction job={job} />
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-neutral-500 sm:col-span-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}>
          <span aria-hidden className={`size-1.5 rounded-full ${badge.dot}`} />
          {stage ? `${badge.label} · ${stage}` : badge.label}
        </span>
        <span>{kindLabels[job.kind]}</span>
        {job.attempts > 0 && <span>{`Versuch ${job.attempts} von ${job.maxAttempts}`}</span>}
        <span>{dateTimeFormat.format(job.createdAt)}</span>
      </div>

      {job.status === "failed" && job.errorMessage && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm break-words text-rose-800 sm:col-span-2">
          {job.errorMessage}
        </p>
      )}
    </li>
  );
}

/** A ready job links to its draft; a failed one can be retried. */
function JobAction({ job }: { job: ListedJob }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    try {
      await retryImportJob({ data: { id: job.id } });
      await router.invalidate();
    } finally {
      setPending(false);
    }
  }

  if (job.status === "ready") {
    return job.referenceSlug ? (
      <Link
        to="/referenzen/$slug"
        params={{ slug: job.referenceSlug }}
        className="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium text-neutral-900 underline underline-offset-4 hover:bg-neutral-100"
      >
        Referenz ansehen
      </Link>
    ) : (
      <span className="shrink-0 px-2.5 py-1.5 text-sm text-neutral-400">Referenz gelöscht</span>
    );
  }
  if (job.status === "failed") {
    return (
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-60"
      >
        {pending ? "Wird gestartet …" : "Erneut versuchen"}
      </button>
    );
  }
  return null;
}
