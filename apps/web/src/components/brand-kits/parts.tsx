/** Small pieces the Brand Kit list and a kit's page share. */

import type { BrandKitStatus } from "@m3-inspo/db/library-schema";
import { statusLabels } from "#/lib/curation";

export const statusDots: Record<BrandKitStatus, string> = {
  draft: "bg-amber-400",
  approved: "bg-emerald-500",
  archived: "bg-neutral-400",
};

/** "Entwurf", "Freigegeben" or "Archiviert" with its dot, as on a reference. */
export function KitStatus({ status }: { status: BrandKitStatus }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-neutral-600">
      <span aria-hidden className={`size-1.5 rounded-full ${statusDots[status]}`} />
      {statusLabels[status]}
    </span>
  );
}

/** A project tag as a quiet chip. */
export function ProjectChip({ project }: { project: string }) {
  return <span className="inline-block rounded-full bg-neutral-200/60 px-2 py-px text-xs text-neutral-600">{project}</span>;
}
