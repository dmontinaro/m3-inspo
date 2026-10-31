import { useFormLanguageGuard } from "#/components/language-control";
import { formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { maxSourceUrlLength } from "#/lib/curation";
import { fieldClassName } from "#/lib/form-styles";
import { maxNoteLength, maxTitleLength } from "#/lib/upload-limits";
import { createUrlImport } from "#/server/import-jobs.functions";
import type { Duplicate } from "#/server/import-jobs.server";
import { TagInput } from "./tag-input";

/**
 * Starts a URL import: the address, and optionally a title, the two notes and
 * tags, which the draft starts with once the worker has captured the page.
 * Each submission carries a `requestId`. Sending the same input again (after
 * a network error, say) keeps it, so the server returns the same job instead
 * of queueing a second one; any change to the input gets a new one. On
 * success it goes to the job list.
 *
 * If the page is already in the library or being imported, the server says
 * so; the form shows what exists and the owner either changes the address or
 * submits again with "Trotzdem importieren".
 */
export function UrlImportForm() {
  const languageForm = useFormLanguageGuard();
  const navigate = useNavigate();
  const lastSubmission = useRef<{ input: string; requestId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ reason: string; found: Duplicate } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const input = JSON.stringify([...data].map(([name, value]) => [name, String(value)]));
    const requestId =
      lastSubmission.current?.input === input ? lastSubmission.current.requestId : crypto.randomUUID();
    lastSubmission.current = { input, requestId };
    data.set("requestId", requestId);
    try {
      const result = await createUrlImport({ data });
      if (!result.ok) {
        if (result.duplicate) return setDuplicate({ reason: result.reason, found: result.duplicate });
        return setError(result.reason);
      }
      await navigate({ to: "/imports" });
    } catch {
      setError(m.import_start_failed());
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={languageForm.form} noValidate onSubmit={submit} className="mt-4 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2 sm:p-5">
      <fieldset disabled={pending} className="contents">
      <div className="sm:col-span-2">
        <label htmlFor="import-url" className="text-sm font-medium">
          {m.field_address()}</label>
        <input
          id="import-url"
          name="url"
          required
          // Not type="url": the browser would turn away "stripe.com", which the server completes to https://.
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          maxLength={maxSourceUrlLength}
          placeholder="https://"
          className={fieldClassName}
          // Another address is another question: the warning no longer applies.
          onChange={() => setDuplicate(null)}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="import-title" className="text-sm font-medium">
          {m.field_title()}<span className="font-normal text-neutral-500">{m.title_optional_page()}</span>
        </label>
        <input id="import-title" name="title" maxLength={maxTitleLength} className={fieldClassName} />
      </div>

      <div>
        <label htmlFor="import-take" className="text-sm font-medium">
          {m.reference_take()}</label>
        <textarea
          id="import-take"
          name="takeNote"
          rows={3}
          maxLength={maxNoteLength}
          placeholder={m.reference_take_placeholder()}
          className={fieldClassName}
        />
      </div>

      <div>
        <label htmlFor="import-avoid" className="text-sm font-medium">
          {m.reference_avoid()}</label>
        <textarea
          id="import-avoid"
          name="avoidNote"
          rows={3}
          maxLength={maxNoteLength}
          placeholder={m.reference_avoid_placeholder()}
          className={fieldClassName}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="import-tags" className="text-sm font-medium">
          {m.field_tags()}</label>
        <TagInput id="import-tags" />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:col-span-2">
          {error}
        </p>
      )}

      {duplicate && (
        <div role="alert" className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-600/20 ring-inset sm:col-span-2">
          <input type="hidden" name="confirmDuplicate" value="1" />
          <p className="font-medium">{duplicate.reason}</p>
          <ul className="mt-1 space-y-0.5">
            {duplicate.found.references.map((reference) => (
              <li key={reference.slug}>
                <Link
                  to="/references/$slug"
                  params={{ slug: reference.slug }}
                  className="underline decoration-amber-700/40 underline-offset-2 hover:decoration-amber-900"
                >
                  {reference.title}
                </Link>
              </li>
            ))}
            {duplicate.found.openJobs > 0 && (
              <li>
                <Link to="/imports" className="underline decoration-amber-700/40 underline-offset-2 hover:decoration-amber-900">
                  {m.imports_already_running({ count: duplicate.found.openJobs, formattedCount: formatNumber(duplicate.found.openJobs) })}
                </Link>
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-amber-800">{m.import_duplicate_help()}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? m.action_starting() : duplicate ? m.import_anyway() : m.import_start()}
        </button>
        {duplicate ? (
          <button
            type="button"
            onClick={() => setDuplicate(null)}
            className="rounded-md px-2.5 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            {m.action_cancel()}</button>
        ) : (
          <p className="text-sm text-neutral-500">{m.import_creates_draft()}</p>
        )}
      </div>
    </fieldset>
      </form>
  );
}
