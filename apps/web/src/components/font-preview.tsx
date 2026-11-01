import * as m from "#/paraglide/messages.js";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { RotateCw } from "lucide-react";
import { recaptureFontPage } from "#/server/type-pairings.functions";
import type { FontPreview } from "#/server/font-previews.server";

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/**
 * The font preview of a family the app cannot load: the screenshot of its
 * linked page, which opens the page. While the page is captured, a note
 * stands in its place; when the capture failed, the reason. The retry action
 * captures the page again. `preview` is missing for a link saved before
 * previews existed.
 */
export function FontPreviewFigure({ family, pageUrl, preview }: { family: string; pageUrl: string; preview?: FontPreview }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const capturing = preview?.status === "capturing";
  const host = hostOf(pageUrl);

  async function recapture() {
    setPending(true);
    try {
      await recaptureFontPage({ data: { url: pageUrl } });
      await router.invalidate();
    } finally {
      setPending(false);
    }
  }

  return (
    <figure className="max-w-4xl">
      <a
        href={pageUrl}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/10 hover:ring-black/25"
      >
        {preview?.image ? (
          <img
            src={preview.image.url}
            width={preview.image.width}
            height={preview.image.height}
            alt={m.font_preview_page_alt({ family, host })}
            className="block h-auto w-full"
          />
        ) : (
          <span className="flex aspect-[16/10] items-center justify-center px-6 text-center text-sm text-neutral-500">
            {capturing ? (
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-2 animate-pulse rounded-full bg-sky-500" />
                {m.font_preview_host_capturing({ host })}
              </span>
            ) : (
              m.font_preview_host_missing({ host })
            )}
          </span>
        )}
      </a>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span>{m.font_preview_host_caption({ host })}</span>
        {capturing && preview.image && <span>{m.font_preview_recapturing()}</span>}
        {preview?.status === "failed" && (
          <div className="text-rose-700">{m.font_preview_failed()}
            {preview.error && <details><summary>{m.job_original_details()}</summary><span>{preview.error}</span></details>}</div>
        )}
        {!capturing && (
          <button
            type="button"
            onClick={recapture}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-60"
          >
            <RotateCw aria-hidden className="size-3" /> {m.font_preview_retry()}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
