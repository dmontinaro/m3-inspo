import { formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuickAdd } from "#/components/quick-add";
import { UrlImportForm } from "#/components/url-import-form";
import { acceptedImageTypes, maxUploadMegabytes } from "#/lib/upload-limits";

export const Route = createFileRoute("/_library/add")({
  head: () => ({ meta: [{ title: m.add_page_title() }] }),
  component: Upload,
});

// Two ways to add a reference. Picked images go to the quick add (layout), the same
// way as pasted or dropped ones: one image opens the note sheet, several upload at once.
// A website address becomes an import job that the capture worker picks up.
function Upload() {
  const addFiles = useQuickAdd();

  return (
    <main className="mx-auto max-w-2xl px-5 pt-2 pb-16 sm:px-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> {m.gallery_title()}</Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{m.add_title()}</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">{m.upload_image()}</h2>
        <label className="mt-4 flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center transition-colors hover:border-neutral-500 has-focus-visible:border-neutral-900">
          <input
            type="file"
            accept={acceptedImageTypes}
            multiple
            onChange={(event) => {
              addFiles([...(event.currentTarget.files ?? [])]);
              // Picking the same file again should still count as a change.
              event.currentTarget.value = "";
            }}
            className="sr-only"
          />
          <span className="font-medium text-neutral-900">{m.upload_choose_or_drop()}</span>
          <span className="mt-1 text-sm text-neutral-500">{m.upload_format_limit({ max: formatNumber(maxUploadMegabytes) })}</span>
        </label>

        <p className="mt-4 text-sm text-neutral-500">
          {m.upload_global_help()}</p>
      </section>

      <section id="website" className="mt-12 scroll-mt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{m.import_website()}</h2>
          <Link to="/imports" className="shrink-0 text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900">
            {m.imports_all()}</Link>
        </div>
        <p className="mt-1 text-[15px] text-neutral-600">
          {m.import_worker_help()}</p>
        <UrlImportForm />
      </section>
    </main>
  );
}
