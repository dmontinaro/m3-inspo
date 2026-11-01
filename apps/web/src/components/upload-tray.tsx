import * as m from "#/paraglide/messages.js";
import { Link } from "@tanstack/react-router";

export type TrayItem = { id: string; label: string } & (
  | { status: "uploading" }
  | { status: "saved"; slug: string }
  | { status: "failed"; reason: string; file: File }
);

/** How each status looks. Saved lines show a link instead of `text`. */
const statusStyles: Record<TrayItem["status"], { dot: string; text: string; textClassName: string }> = {
  uploading: { dot: "animate-pulse bg-neutral-400", get text() { return m.upload_running(); }, textClassName: "text-neutral-500" },
  saved: { dot: "bg-emerald-500", get text() { return m.upload_saved(); }, textClassName: "text-neutral-600" },
  failed: { dot: "bg-rose-500", get text() { return m.upload_rejected(); }, textClassName: "text-rose-700" },
};

/** Small panel in the corner with one line per upload: running, saved (with a link) or rejected (with the reason). */
export function UploadTray({ items, onClose }: { items: TrayItem[]; onClose: () => void }) {
  if (items.length === 0) return null;

  const heading = items.some((item) => item.status === "uploading")
    ? m.upload_in_progress()
    : items.some((item) => item.status === "failed")
      ? m.upload_partial()
      : m.upload_saved();

  return (
    <section
      aria-label={m.uploads_title()}
      className="fixed right-4 bottom-4 z-40 w-[23rem] overflow-hidden rounded-lg bg-white text-sm shadow-lg ring-1 shadow-black/10 ring-black/10 max-sm:inset-x-3 max-sm:bottom-3 max-sm:w-auto"
    >
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 pr-2 pl-4">
        <h2 aria-live="polite" className="font-medium text-neutral-900">
          {heading}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={m.action_close()}
          className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <span aria-hidden>✕</span>
        </button>
      </header>
      <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${statusStyles[item.status].dot}`} />
              <span className="min-w-0 flex-1 truncate text-neutral-800">{item.label}</span>
              {item.status === "saved" ? (
                <Link
                  to="/references/$slug"
                  params={{ slug: item.slug }}
                  className="shrink-0 text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
                >
                  {m.action_view()}</Link>
              ) : (
                <span className={`shrink-0 ${statusStyles[item.status].textClassName}`}>{statusStyles[item.status].text}</span>
              )}
            </div>
            {item.status === "failed" && <p className="mt-1 pl-[1.125rem] text-rose-800">{item.reason}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
