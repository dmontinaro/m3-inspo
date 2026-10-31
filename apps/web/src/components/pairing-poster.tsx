import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { fontRoleLabels, fontRoles, sampleTexts } from "#/lib/fonts";
import type { FontRoles, RoleFont } from "#/lib/fonts";
import { StandInBadge, useFontFaces } from "./font-faces";

/** The roles a pairing has, in display order; the editor passes roles it has not chosen yet as undefined. */
export const roleEntries = (roles: Partial<FontRoles>) =>
  fontRoles.flatMap((role) => {
    const font = roles[role];
    return font ? [{ role, font }] : [];
  });

/** A family's boldest weight, for headings. */
export const heaviest = (font: RoleFont) => Math.max(...font.weights);

/**
 * A family's name; with a page link (adobe, local), it opens that page in a
 * new tab. While editing, a link without scheme is not a link yet.
 */
export function FamilyName({ font }: { font: RoleFont }) {
  if (!font.pageUrl || !/^https?:\/\//.test(font.pageUrl)) return font.family;
  return (
    <a
      href={font.pageUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950 hover:decoration-neutral-500"
    >
      {font.family}
      <ArrowUpRight aria-hidden className="size-3.5" />
    </a>
  );
}

/**
 * The head of a pairing's poster: its families, the name large in the
 * heading font, a paragraph (the note, else a sample) in the body font and
 * a mono line when there is a mono role. Shows on the detail page and as the
 * live preview while editing. `children` go below, e.g. the origin.
 */
export function PairingPosterHead({
  name,
  text,
  roles,
  children,
}: {
  name: string;
  text: string;
  roles: Partial<FontRoles>;
  children?: ReactNode;
}) {
  const { heading, body, mono } = roles;
  const { fontStyle } = useFontFaces([heading, body, mono]);
  // Each family once, with its badge, in role order.
  const families = roleEntries(roles)
    .map(({ font }) => font)
    .filter((font, index, all) => font.family.trim() && all.findIndex((other) => other.family === font.family) === index);

  return (
    <header>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
        {families.length === 0 && "Noch keine Schrift gewählt"}
        {families.map((font, index) => (
          <span key={font.family} className="inline-flex items-center gap-1.5">
            {index > 0 && <span aria-hidden>+</span>}
            <FamilyName font={font} />
            <StandInBadge font={font} />
          </span>
        ))}
      </p>
      <h1
        className="mt-2 text-5xl leading-[0.95] tracking-tight break-words text-neutral-950 sm:text-7xl lg:text-8xl"
        style={heading?.weights.length ? fontStyle(heading, heaviest(heading)) : undefined}
      >
        {name}
      </h1>
      <p
        className="mt-6 max-w-2xl text-lg leading-relaxed whitespace-pre-line text-neutral-700 sm:text-xl"
        style={body?.weights.length ? fontStyle(body) : undefined}
      >
        {text}
      </p>
      {mono?.weights.length ? (
        <p className="mt-4 text-[15px] text-neutral-600" style={fontStyle(mono)}>
          <span className="sr-only">{fontRoleLabels.mono}: </span>
          {sampleTexts.mono}
        </p>
      ) : null}
      {children}
    </header>
  );
}
