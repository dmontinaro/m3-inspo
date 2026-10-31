import { formatNumber } from "#/lib/format";
import { useFormLanguageGuard, useLanguageGuard } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { Pencil, SquareDashedMousePointer, Trash2 } from "lucide-react";
import { COMPONENT_TYPES } from "@m3-inspo/taxonomy";
import type { ComponentType } from "@m3-inspo/taxonomy";
import { fieldClassName } from "#/lib/form-styles";
import { componentTypeLabels, minRegionSide } from "#/lib/regions";
import { maxNoteLength } from "#/lib/upload-limits";
import type { getReference } from "#/server/library.functions";
import { addRegion, deleteRegion, updateRegion } from "#/server/regions.functions";

type Capture = Awaited<ReturnType<typeof getReference>>["captures"][number];
type Region = Capture["regions"][number];
/** A rectangle in the capture's pixels. */
type Rect = { x: number; y: number; width: number; height: number };

/** What each capture shows, in the owner's words. Only captures that exist are listed. */
const captureLabels: Partial<Record<string, string>> = {
  get "desktop/hero"() { return m.capture_desktop_viewport(); },
  get "desktop/full"() { return m.capture_desktop_full(); },
  get "mobile/hero"() { return m.capture_mobile_viewport(); },
  get "mobile/full"() { return m.capture_mobile_full(); },
};



/**
 * One capture with what it shows and the regions marked on it: outlined on
 * the image and listed below it with crop, type and note. A phone capture
 * (or any capture of a mobile reference, `phoneSized`) stays phone-sized, and a full page scrolls in its own frame, so it does
 * not push the others away.
 *
 * "Bereich markieren" (from tablet width up; on phones regions can be
 * viewed, edited and deleted, not drawn) turns the image into a canvas:
 * drag a rectangle, pick a component type, add a note, save. The server cuts
 * the crop. Escape drops the rectangle, then leaves marking.
 */
export function CaptureFigure({
  capture,
  title,
  slug,
  phoneSized = false,
}: {
  capture: Capture;
  title: string;
  slug: string;
  phoneSized?: boolean;
}) {
  const router = useRouter();
  const label = captureLabels[`${capture.viewport}/${capture.kind}`];
  const [marking, setMarking] = useState(false);
  const [draft, setDraft] = useState<Rect | null>(null);
  useLanguageGuard({ dirty: draft !== null });
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!marking) return;
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector("dialog[data-language-warning][open]")) return;
      if (draft) setDraft(null);
      else setMarking(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [marking, draft]);

  /** The pointer's position in the capture's pixels, kept on the image. */
  function pointOf(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return {
      x: clamp((event.clientX - box.left) / box.width) * capture.width,
      y: clamp((event.clientY - box.top) / box.height) * capture.height,
    };
  }

  function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
    const x = Math.floor(Math.min(a.x, b.x));
    const y = Math.floor(Math.min(a.y, b.y));
    return {
      x,
      y,
      width: Math.min(capture.width, Math.ceil(Math.max(a.x, b.x))) - x,
      height: Math.min(capture.height, Math.ceil(Math.max(a.y, b.y))) - y,
    };
  }

  function beginDraw(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = pointOf(event);
    setDraft({ ...start.current, width: 0, height: 0 });
    setDrawing(true);
  }

  function draw(event: PointerEvent<HTMLDivElement>) {
    if (start.current) setDraft(rectBetween(start.current, pointOf(event)));
  }

  function endDraw(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const rect = rectBetween(start.current, pointOf(event));
    start.current = null;
    setDrawing(false);
    // A click or a tiny slip is no region.
    setDraft(rect.width >= minRegionSide && rect.height >= minRegionSide ? rect : null);
  }

  const image = (
    <img
      src={capture.preview.url}
      alt={m.capture_description({ capture: label ?? m.capture_label(), title })}
      width={capture.preview.width}
      height={capture.preview.height}
      draggable={false}
      className="w-full rounded-lg bg-neutral-200 ring-1 ring-black/5"
    />
  );

  const canvas = (
    <div className="relative">
      {capture.kind === "full" || marking ? (
        image
      ) : (
        <a href={capture.originalUrl} target="_blank" rel="noreferrer" className="block">
          {image}
        </a>
      )}
      {/* Outside marking only the region boxes take the pointer, so a click elsewhere opens the original. */}
      <div
        onPointerDown={marking ? beginDraw : undefined}
        onPointerMove={marking ? draw : undefined}
        onPointerUp={marking ? endDraw : undefined}
        className={`absolute inset-0 overflow-hidden rounded-lg ${marking ? "cursor-crosshair touch-none select-none" : "pointer-events-none"}`}
      >
        {capture.regions.map((region) => (
          <RegionBox
            key={region.id}
            capture={capture}
            rect={region}
            label={componentTypeLabels[region.componentType]}
            active={highlighted === region.id || editing === region.id}
            onSelect={marking ? undefined : () => setEditing(region.id)}
          />
        ))}
        {draft && <RegionBox capture={capture} rect={draft} draft />}
      </div>
    </div>
  );

  return (
    <figure className={capture.viewport === "mobile" || phoneSized ? "max-w-xs" : undefined}>
      {capture.kind === "full" ? (
        <div className="max-h-[70vh] overflow-y-auto rounded-lg ring-1 ring-black/5">{canvas}</div>
      ) : (
        canvas
      )}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-500">
        <span className="min-w-0 flex-1">
          {label && <span className="font-medium text-neutral-700">{`${label} · `}</span>}
          {m.capture_dimensions({ width: formatNumber(capture.width), height: formatNumber(capture.height) }) + " · "}
          <a href={capture.originalUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-neutral-900">
            {m.capture_open_original()}</a>
        </span>
        {marking && !draft && <span className="text-neutral-600 max-md:hidden">{m.region_draw_help()}</span>}
        <button
          type="button"
          aria-pressed={marking}
          onClick={() => {
            setMarking((value) => !value);
            setDraft(null);
            setEditing(null);
          }}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-neutral-600 ring-1 ring-neutral-300 ring-inset hover:bg-neutral-100 hover:text-neutral-900 aria-pressed:bg-neutral-900 aria-pressed:text-white aria-pressed:ring-neutral-900 max-md:hidden"
        >
          <SquareDashedMousePointer aria-hidden className="size-3.5" strokeWidth={1.75} />
          {marking ? m.job_ready() : m.region_mark()}
        </button>
      </figcaption>

      {draft && !drawing && (
        <RegionForm
          heading={m.region_new()}
          autoScroll
          onCancel={() => setDraft(null)}
          onSave={async (fields) => {
            const result = await addRegion({ data: { slug, captureId: capture.id, ...draft, ...fields } });
            if (!result.ok) return result.reason;
            await router.invalidate();
            setDraft(null);
            return null;
          }}
        />
      )}

      {capture.regions.length > 0 && (
        <section aria-label={m.regions_on_capture({ capture: label ?? m.capture_this() })} className="mt-4">
          <h3 className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{m.regions_heading({ count: formatNumber(capture.regions.length) })}</h3>
          <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
            {capture.regions.map((region) =>
              editing === region.id ? (
                <li key={region.id} className="py-3">
                  <RegionForm
                    heading={m.region_edit()}
                    region={region}
                    onCancel={() => setEditing(null)}
                    onSave={async (fields) => {
                      const result = await updateRegion({ data: { id: region.id, ...fields } });
                      if (!result.ok) return result.reason;
                      await router.invalidate();
                      setEditing(null);
                      return null;
                    }}
                  />
                </li>
              ) : (
                <RegionRow
                  key={region.id}
                  region={region}
                  onHover={(hovered) => setHighlighted(hovered ? region.id : null)}
                  onEdit={() => setEditing(region.id)}
                  onDeleted={() => router.invalidate()}
                />
              ),
            )}
          </ul>
        </section>
      )}
    </figure>
  );
}

/** A rectangle on the capture, placed in percent so it follows the image's size. */
function RegionBox({
  capture,
  rect,
  label,
  active = false,
  draft = false,
  onSelect,
}: {
  capture: Capture;
  rect: Rect;
  label?: string;
  active?: boolean;
  draft?: boolean;
  onSelect?: () => void;
}) {
  const style = {
    left: `${(rect.x / capture.width) * 100}%`,
    top: `${(rect.y / capture.height) * 100}%`,
    width: `${(rect.width / capture.width) * 100}%`,
    height: `${(rect.height / capture.height) * 100}%`,
  };
  if (draft) {
    return (
      <div
        aria-hidden
        style={style}
        className="absolute rounded-sm border-2 border-dashed border-sky-500 bg-sky-400/15 shadow-[0_0_0_9999px_rgb(0_0_0/0.25)]"
      />
    );
  }
  return (
    <button
      type="button"
      tabIndex={onSelect ? undefined : -1}
      disabled={!onSelect}
      onClick={onSelect}
      title={onSelect ? m.edit_named({ name: label ?? m.region_label() }) : undefined}
      style={style}
      className={`group absolute rounded-sm border-2 text-left transition-colors ${onSelect ? "pointer-events-auto cursor-pointer" : "pointer-events-none"} ${
        active ? "border-sky-600 bg-sky-500/20" : "border-sky-500/90 bg-sky-500/5 hover:bg-sky-500/15"
      }`}
    >
      <span className="absolute top-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-sky-600 px-1.5 py-0.5 text-[11px] leading-tight font-medium text-white shadow-sm">
        {label}
      </span>
    </button>
  );
}

/** One region in the list below the capture: crop, type, note and its actions. */
function RegionRow({
  region,
  onHover,
  onEdit,
  onDeleted,
}: {
  region: Region;
  onHover: (hovered: boolean) => void;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const typeLabel = componentTypeLabels[region.componentType];

  async function remove() {
    if (!window.confirm(m.region_delete_confirm({ name: typeLabel }))) return;
    setPending(true);
    setFailed(false);
    try {
      await deleteRegion({ data: { id: region.id } });
      await onDeleted();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <li
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className="flex items-start gap-3 py-3"
    >
      <img
        src={region.thumbUrl}
        alt=""
        loading="lazy"
        className="h-12 w-20 shrink-0 rounded-md bg-neutral-100 object-contain ring-1 ring-black/5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">{typeLabel}</p>
        {region.note ? (
          <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed whitespace-pre-line text-neutral-600">{region.note}</p>
        ) : (
          <p className="mt-0.5 text-sm text-neutral-400">{m.note_none()}</p>
        )}
        {failed && (
          <p role="alert" className="mt-1 text-sm text-rose-700">
            {m.action_failed()}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-0.5">
        <IconButton label={m.action_edit()} onClick={onEdit} disabled={pending}>
          <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton label={m.action_delete()} onClick={remove} disabled={pending} danger>
          <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 text-neutral-400 disabled:opacity-60 ${danger ? "hover:bg-rose-50 hover:text-rose-700" : "hover:bg-neutral-100 hover:text-neutral-800"}`}
    >
      {children}
    </button>
  );
}

type RegionFields = { componentType: ComponentType; note: string };

/**
 * Type and note of a new or an existing region. `onSave` answers a German
 * reason to show, or null once saved. Escape cancels, Ctrl/⌘+Enter saves.
 */
function RegionForm({
  heading,
  region,
  autoScroll = false,
  onSave,
  onCancel,
}: {
  heading: string;
  region?: Region;
  /** Scrolls the form into view when it opens, e.g. under a tall capture. */
  autoScroll?: boolean;
  onSave: (fields: RegionFields) => Promise<string | null>;
  onCancel: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const languageForm = useFormLanguageGuard();
  const [componentType, setComponentType] = useState<ComponentType | null>(region?.componentType ?? null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (autoScroll) form.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [autoScroll]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!componentType) return;
    setPending(true);
    setProblem(null);
    try {
      const note = String(new FormData(event.currentTarget).get("note") ?? "");
      setProblem(await onSave({ componentType, note }));
    } catch {
      setProblem(m.action_failed());
    }
    setPending(false);
  }

  function handleKeys(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !pending) {
      // Handled here, so marking mode stays on.
      event.stopPropagation();
      onCancel();
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  const attachForm = useCallback((node: HTMLFormElement | null) => { form.current = node; languageForm.form(node); }, [languageForm.form]);
  const noteId = `region-note-${region?.id ?? "new"}`;

  return (
    <form
      ref={attachForm}
      onSubmit={submit}
      onKeyDown={handleKeys}
      noValidate
      className={region ? "space-y-4" : "mt-4 space-y-4 rounded-lg bg-white p-4 ring-1 ring-neutral-200"}
    >
      <p className="text-sm font-semibold text-neutral-900">{heading}</p>
      <fieldset>
        <legend className="text-sm font-medium text-neutral-800">{m.region_component_type()}</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {COMPONENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={componentType === type}
              onClick={() => setComponentType(type)}
              className="rounded-full px-2.5 py-1 text-sm text-neutral-700 ring-1 ring-neutral-300 ring-inset hover:bg-neutral-100 hover:text-neutral-950 aria-pressed:bg-neutral-900 aria-pressed:text-white aria-pressed:ring-neutral-900"
            >
              {componentTypeLabels[type]}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={noteId} className="text-sm font-medium text-neutral-800">
          {m.field_note()}</label>
        <textarea
          id={noteId}
          name="note"
          maxLength={maxNoteLength}
          defaultValue={region?.note ?? ""}
          placeholder={m.region_note_placeholder()}
          className={`${fieldClassName} field-sizing-content min-h-20 leading-relaxed`}
        />
      </div>
      {problem && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {problem}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !componentType}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? m.action_saving() : m.action_save()}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-60"
        >
          {m.action_cancel()}</button>
        <span className="ml-auto text-xs text-neutral-400 max-sm:hidden">{m.shortcut_save()}</span>
      </div>
    </form>
  );
}
