import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuickAdd } from "#/components/quick-add";
import { UrlImportForm } from "#/components/url-import-form";
import { acceptedImageTypes, maxUploadMegabytes } from "#/lib/upload-limits";

export const Route = createFileRoute("/_library/hochladen")({
  head: () => ({ meta: [{ title: "Hinzufügen · m3 inspo" }] }),
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
        <span aria-hidden>←</span> Galerie
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Hinzufügen</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">Bild hochladen</h2>
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
          <span className="font-medium text-neutral-900">Screenshots auswählen oder hierher ziehen</span>
          <span className="mt-1 text-sm text-neutral-500">{`PNG, JPEG oder WebP, bis ${maxUploadMegabytes} MB`}</span>
        </label>

        <p className="mt-4 text-sm text-neutral-500">
          Geht auch ohne diese Seite: Screenshot mit Strg+V bzw. ⌘V einfügen oder Dateien ins Fenster ziehen, egal wo du
          gerade bist.
        </p>
      </section>

      <section id="website" className="mt-12 scroll-mt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Website importieren</h2>
          <Link to="/importe" className="shrink-0 text-sm text-neutral-600 underline underline-offset-4 hover:text-neutral-900">
            Alle Importe
          </Link>
        </div>
        <p className="mt-1 text-[15px] text-neutral-600">
          Der Capture-Worker nimmt die Seite für Desktop und Mobile auf.
        </p>
        <UrlImportForm />
      </section>
    </main>
  );
}
