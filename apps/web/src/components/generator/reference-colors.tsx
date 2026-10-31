import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Pipette, X, ZoomIn, ZoomOut } from "lucide-react";
import type { PoolColor, SourceColor } from "@m3-inspo/shared/color-scheme";
import type { PoolReference } from "#/lib/generator";
import { naturalPixel, pixelReader } from "#/lib/pipette";
import type { PixelReader } from "#/lib/pipette";
import { readImagePixel } from "#/server/generator.functions";

const measuredLabels: Record<PoolColor["measuredBy"], string> = {
  dom: "aus der Seite gelesen",
  vision: "von der KI geschätzt",
};

/** Up to this width the pipette fits the image to the screen; past it, it shows it shrunk. */
const MAX_FIT_WIDTH = 1440;

type Props = {
  references: PoolReference[];
  colors: PoolColor[];
  /** The source colour the picker edits, to mark the colour it was taken from. */
  source: SourceColor;
  onTake: (hex: string, referenceId: string) => void;
};

/**
 * The picker's "Aus Referenz": the pool's references with their measured
 * colours. A colour takes it over; a reference's image opens enlarged for
 * the pipette.
 */
export function ReferenceColors({ references, colors, source, onTake }: Props) {
  const [enlarged, setEnlarged] = useState<{ reference: PoolReference; opener: HTMLElement } | null>(null);
  const takenFrom = source.origin.kind === "reference" ? source.origin.referenceId : null;

  if (references.length === 0)
    return (
      <p className="py-6 text-center text-xs leading-snug text-neutral-500">Keine Referenzen im Pool. Wähle oben einen anderen Pool.</p>
    );

  return (
    <>
      <ul className="-mx-1 max-h-64 space-y-1 overflow-y-auto overscroll-contain px-1" aria-label="Referenzen im Pool">
        {references.map((reference) => {
          // A hex the palette names twice shows once.
          const measured = [
            ...new Map(colors.filter((color) => color.referenceId === reference.id).map((color) => [color.hex, color])).values(),
          ];
          return (
            <li key={reference.id} className="flex items-center gap-3 rounded-lg py-1">
              <button
                type="button"
                onClick={(event) => setEnlarged({ reference, opener: event.currentTarget })}
                aria-label={`Bild von ${reference.title} für die Pipette öffnen`}
                title="Vergrößern und mit der Pipette eine Farbe aus dem Bild nehmen"
                className="group relative h-11 w-16 shrink-0 overflow-hidden rounded-md bg-neutral-200 ring-1 ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              >
                {reference.thumbUrl && <img src={reference.thumbUrl} alt="" loading="lazy" className="size-full object-cover object-top" />}
                <span className="absolute right-0.5 bottom-0.5 grid size-5 place-items-center rounded bg-white/90 text-neutral-800 shadow-sm transition-colors group-hover:bg-neutral-900 group-hover:text-white">
                  <Pipette aria-hidden className="size-3" strokeWidth={2} />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-700">{reference.title}</p>
                {measured.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {measured.map((color) => {
                      const taken = takenFrom === reference.id && source.hex === color.hex;
                      return (
                        <button
                          key={color.hex}
                          type="button"
                          onClick={() => onTake(color.hex, reference.id)}
                          aria-pressed={taken}
                          aria-label={`${color.hex.slice(1).toUpperCase()} übernehmen, ${measuredLabels[color.measuredBy]}`}
                          title={`${color.hex.slice(1).toUpperCase()} · ${measuredLabels[color.measuredBy]}`}
                          style={{ background: color.hex }}
                          className={`size-7 rounded-md ring-1 ring-black/10 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${
                            taken ? "ring-2 ring-neutral-900 ring-offset-2" : ""
                          }`}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-neutral-500">Keine gemessenen Farben, nur Pipette</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-snug text-neutral-500">
        Farbe übernehmen oder Bild öffnen und mit der Pipette hineintippen. Übernommene Farben werden exakt gesperrt.
      </p>

      {enlarged && (
        <PipetteView
          reference={enlarged.reference}
          onPick={(hex) => onTake(hex, enlarged.reference.id)}
          onClose={() => {
            enlarged.opener.focus({ preventScroll: true });
            setEnlarged(null);
          }}
        />
      )}
    </>
  );
}

/**
 * A reference's original image in a modal dialog, as large as the screen
 * allows, scrolled for long pages; where it has to shrink (a phone), a
 * toggle shows it at its own size, to pan around. A click or tap takes the
 * pixel under it, read exactly from the original on the server, and
 * closes; with a mouse, a preview of the pixel under the pointer shows
 * first. Escape or a click beside the image closes without taking anything,
 * and only this dialog, not the picker it opens from.
 */
function PipetteView({ reference, onPick, onClose }: { reference: PoolReference; onPick: (hex: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const reader = useRef<PixelReader | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [taking, setTaking] = useState<"idle" | "busy" | "failed">("idle");
  const [hovered, setHovered] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [frameWidth, setFrameWidth] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  // Measured again on every resize or turn of the phone.
  const canZoom = naturalWidth > Math.min(frameWidth, MAX_FIT_WIDTH);

  useEffect(() => dialog.current?.showModal(), []);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Closes the modal first: until then the picker behind it is inert and cannot take the focus back. */
  function close() {
    dialog.current?.close();
    onClose();
  }

  /** The original's pixel under the pointer, once the image has loaded. */
  function pointAt(event: MouseEvent<HTMLImageElement>) {
    const element = image.current;
    if (!element || state !== "ready") return null;
    const box = element.getBoundingClientRect();
    const natural = { width: element.naturalWidth, height: element.naturalHeight };
    return { element, ...naturalPixel({ x: event.clientX - box.left, y: event.clientY - box.top }, box, natural) };
  }

  function preview(event: MouseEvent<HTMLImageElement>) {
    const point = pointAt(event);
    if (!point || previewBroken) return;
    try {
      reader.current ??= pixelReader();
      setHovered(reader.current(point.element, point.x, point.y));
    } catch {
      // No canvas, or one the browser will not read: the take still works, only the preview stops.
      setPreviewBroken(true);
      setHovered(null);
    }
  }

  async function take(event: MouseEvent<HTMLImageElement>) {
    const point = pointAt(event);
    if (!point || taking === "busy") return;
    setTaking("busy");
    const hex = await readImagePixel({ data: { image: reference.imageUrl, x: point.x, y: point.y } }).catch(() => null);
    // Closed while the server read the pixel: the take was called off.
    if (!dialog.current?.open) return;
    if (!hex) {
      setTaking("failed");
      return;
    }
    onPick(hex);
    close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    // Only this dialog closes; useDismiss leaves the picker around it open for a handled Escape.
    event.preventDefault();
    close();
  }

  const hint =
    state === "failed"
      ? "Das Bild ließ sich nicht laden."
      : taking === "failed"
        ? "Der Pixel ließ sich nicht lesen. Bitte noch einmal tippen."
        : taking === "busy"
          ? "Pixel wird gelesen …"
          : "Ins Bild tippen übernimmt den Pixel.";

  return (
    <dialog
      ref={dialog}
      aria-label={`Pipette in „${reference.title}“`}
      // Focusable, so a click on its title or frame keeps the focus (and Escape) inside.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => event.target === event.currentTarget && close()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 outline-none backdrop:bg-neutral-950/60 sm:p-6"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl shadow-black/30 sm:rounded-xl">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <Pipette aria-hidden className="size-4 shrink-0 text-neutral-500" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">{reference.title}</p>
            <p
              className={`text-xs leading-snug ${state === "failed" || taking === "failed" ? "text-red-700" : "text-neutral-500"}`}
              role="status"
            >
              {hint}
            </p>
          </div>
          {hovered && (
            <span className="hidden items-center gap-2 text-xs text-neutral-700 tabular-nums sm:flex" aria-hidden>
              <span className="size-5 rounded ring-1 ring-black/10" style={{ background: hovered }} />
              {hovered.slice(1).toUpperCase()}
            </span>
          )}
          {canZoom && (
            <button
              type="button"
              onClick={() => setZoomed((value) => !value)}
              aria-pressed={zoomed}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              {zoomed ? (
                <ZoomOut aria-hidden className="size-4" strokeWidth={2} />
              ) : (
                <ZoomIn aria-hidden className="size-4" strokeWidth={2} />
              )}
              {zoomed ? "Einpassen" : "Vergrößern"}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Schließen"
            className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X aria-hidden className="size-5" strokeWidth={2} />
          </button>
        </div>
        <div ref={frame} className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-neutral-100">
          {state === "loading" && <p className="absolute inset-x-0 top-10 text-center text-sm text-neutral-500">Original wird geladen …</p>}
          <img
            ref={image}
            src={reference.imageUrl}
            alt={reference.title}
            draggable={false}
            onLoad={(event) => {
              setNaturalWidth(event.currentTarget.naturalWidth);
              setState("ready");
            }}
            onError={() => setState("failed")}
            onPointerMove={(event) => event.pointerType === "mouse" && preview(event)}
            onPointerLeave={() => setHovered(null)}
            onClick={(event) => void take(event)}
            style={zoomed && canZoom ? { width: naturalWidth, maxWidth: "none" } : undefined}
            className={`mx-auto block h-auto w-full max-w-[1440px] bg-white select-none ${state === "ready" ? "" : "invisible"} ${
              taking === "busy" ? "cursor-progress" : "cursor-crosshair"
            }`}
          />
        </div>
      </div>
    </dialog>
  );
}
