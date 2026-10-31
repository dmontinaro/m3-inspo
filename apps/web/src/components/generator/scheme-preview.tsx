/**
 * The generator's preview, painted only with the scheme's CSS variables
 * (`--primary`, `--brand-600`, `--teal-100` …, the names of the export) and
 * set in a kit's fonts (`--font-heading`, `--font-body`), else in the
 * system font: building blocks on the left, an app overview on the right
 * that stays in view while scrolling. Extra colours appear as chart lines,
 * tags and icons. Dark mode swaps the roles for their dark counterpart and
 * reads tints from the dark end of each scale.
 */

import type { CSSProperties, ReactNode } from "react";
import { BedDouble, Building2, CalendarDays, CircleAlert, LayoutDashboard, Settings, Users } from "lucide-react";
import { ROLE_NAMES, STEPS, buildDarkRoles } from "@m3-inspo/shared/color-scheme";
import type { ColorSchemeSnapshot, Role, RoleName } from "@m3-inspo/shared/color-scheme";
import { fallbackStacks } from "@m3-inspo/shared/fonts";
import type { FontRoles } from "@m3-inspo/shared/fonts";
import { useFontFaces } from "#/components/font-faces";
import { regularWeight } from "#/lib/fonts";
import { ContrastBadge } from "./parts";

function schemeVariables(snapshot: ColorSchemeSnapshot, roleValues: Record<RoleName, Role>): CSSProperties {
  const roles = ROLE_NAMES.map((role) => [`--${role}`, roleValues[role].hex]);
  const scales = snapshot.scales.flatMap((scale) => STEPS.map((step) => [`--${scale.name}-${step}`, scale.steps[step]]));
  return Object.fromEntries([...roles, ...scales]) as CSSProperties;
}

/**
 * A tinted surface and the text on it, from one scale: light steps on a
 * light page, dark steps on a dark one. `ink` is the text or icon step.
 */
function tint(scale: string, dark: boolean, ink: "text" | "icon" = "text"): CSSProperties {
  if (dark) return { background: `var(--${scale}-900)`, color: `var(--${scale}-${ink === "text" ? 200 : 300})` };
  return { background: `var(--${scale}-100)`, color: `var(--${scale}-${ink === "text" ? 800 : 700})` };
}

/** The signal note: the palest danger step with dark text, or the darkest with light text. */
const alertTint = (dark: boolean): CSSProperties =>
  dark ? { background: "var(--danger-950)", color: "var(--danger-200)" } : { background: "var(--danger-50)", color: "var(--danger-800)" };

/** Headings in the preview take the heading font; everything else inherits the body font. */
const headingFont = "font-(family-name:--font-heading)";

/** The fonts as the preview's variables, each family once its weight has loaded; without fonts the system font. */
function useFontVariables(fonts: FontRoles | null): CSSProperties {
  const { fontStyle } = useFontFaces([fonts?.heading, fonts?.body]);
  if (!fonts) return { "--font-heading": fallbackStacks.sans, "--font-body": fallbackStacks.sans } as CSSProperties;
  return {
    "--font-heading": fontStyle(fonts.heading, Math.max(...fonts.heading.weights)).fontFamily,
    "--font-body": fontStyle(fonts.body, regularWeight(fonts.body)).fontFamily,
  } as CSSProperties;
}

/**
 * `extras` are the extra colours' scale names, in order; `fonts` a kit's
 * font roles (none: the system font). `aside` sits above the building
 * blocks, e.g. a kit's fonts, and brings its own colours and font. `dark`
 * paints it with the dark roles.
 */
export function SchemePreview({
  snapshot,
  extras,
  fonts = null,
  aside,
  dark = false,
}: {
  snapshot: ColorSchemeSnapshot;
  extras: string[];
  fonts?: FontRoles | null;
  aside?: ReactNode;
  dark?: boolean;
}) {
  // Without extras the brand stands in for chart lines, tags and icons.
  const accents = extras.length > 0 ? extras : ["brand"];
  const fontVariables = useFontVariables(fonts);
  const roles = dark ? buildDarkRoles(snapshot).roles : snapshot.roles;
  return (
    <div
      style={{ ...schemeVariables(snapshot, roles), ...fontVariables, fontFamily: "var(--font-body)", colorScheme: dark ? "dark" : "light" }}
      className="grid items-start gap-4 rounded-2xl bg-(--background) p-3 text-(--foreground) ring-1 ring-black/5 sm:p-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        {aside}
        <BuildingBlocks snapshot={snapshot} roles={roles} accents={accents} dark={dark} />
      </div>
      <div className="@container overflow-hidden rounded-xl border border-(--border) lg:sticky lg:top-4">
        <AppOverview accents={accents} dark={dark} />
      </div>
    </div>
  );
}

/* ────────────── Building blocks ────────────── */

const textSteps: { label: string; className: string; text: string; role: RoleName }[] = [
  { label: "Überschrift", className: `${headingFont} text-3xl font-semibold tracking-tight`, text: "Übersicht", role: "foreground" },
  { label: "Zwischentitel", className: `${headingFont} text-lg font-semibold`, text: "Nächste Anreisen", role: "foreground" },
  { label: "Fließtext", className: "text-[15px] leading-relaxed", text: "Zimmer, Schichten und Anreisen an einem Ort.", role: "foreground" },
  { label: "Nebentext", className: "text-[13px]", text: "Montag, 29. September · 4 Häuser", role: "muted-foreground" },
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-(--border) px-5 py-5 last:border-0">
      <h3 className="text-xs font-semibold text-(--muted-foreground)">{title}</h3>
      {children}
    </section>
  );
}

function BuildingBlocks({
  snapshot,
  roles,
  accents,
  dark,
}: {
  snapshot: ColorSchemeSnapshot;
  roles: Record<RoleName, Role>;
  accents: string[];
  dark: boolean;
}) {
  const scaleLabel = (name: string) => (name === "brand" ? "Marke" : name === "neutral" ? "Neutral" : name === "danger" ? "Signal" : name);
  return (
    <div className="rounded-xl border border-(--border) bg-(--card) text-(--card-foreground)">
      <Block title="Text">
        <div className="space-y-3">
          {textSteps.map((step) => (
            <div key={step.label}>
              <p className="text-[11px] text-(--muted-foreground)">
                {step.label} · {step.role}
              </p>
              <p className={step.className} style={{ color: `var(--${step.role})` }}>
                {step.text}
              </p>
            </div>
          ))}
          <p className="text-[15px]">
            Mit einem <span className="font-medium text-(--primary) underline underline-offset-4">Link in primary</span>.
          </p>
        </div>
      </Block>

      <Block title="Rollen">
        <ul className="space-y-2">
          {ROLE_NAMES.map((name) => {
            const role = roles[name];
            return (
              <li key={name} className="flex items-center gap-2.5">
                <span className={`size-7 shrink-0 rounded-md ring-1 ${dark ? "ring-white/15" : "ring-black/10"}`} style={{ background: role.hex }} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-medium">{name}</p>
                  <p className="truncate text-[11px] text-(--muted-foreground)">
                    {role.derivation} · <span className="uppercase tabular-nums">{role.hex.slice(1)}</span>
                  </p>
                </div>
                {role.contrast && <ContrastBadge ratio={role.contrast.ratio} min={role.contrast.min} />}
              </li>
            );
          })}
        </ul>
      </Block>

      <Block title="Skalen">
        <div className="space-y-2.5">
          {snapshot.scales.map((scale) => (
            <div key={scale.name}>
              <p className="mb-1 flex justify-between text-[11px] text-(--muted-foreground)">
                <span>{scaleLabel(scale.name)}</span>
                <span>{scale.name}-50 … 950</span>
              </p>
              <div className="flex overflow-hidden rounded-md">
                {STEPS.map((step) => (
                  <span key={step} title={`${scale.name}-${step} ${scale.steps[step]}`} className="relative h-6 flex-1" style={{ background: scale.steps[step] }}>
                    {step === scale.anchorStep && (
                      <span className="absolute inset-x-0 bottom-1 mx-auto size-1.5 rounded-full bg-white ring-1 ring-black/40" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Elemente">
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md bg-(--primary) px-3 py-1.5 font-medium text-(--primary-foreground)">Speichern</span>
            <span className="rounded-md border border-(--border) bg-(--card) px-3 py-1.5 font-medium">Abbrechen</span>
            <span className="rounded-md bg-(--muted) px-3 py-1.5 font-medium">Später</span>
            <span className="rounded-md bg-(--destructive) px-3 py-1.5 font-medium text-white">Löschen</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs font-medium">
            <span className="rounded-full bg-(--muted) px-2 py-0.5 text-(--muted-foreground)">Bestätigt</span>
            {["brand", ...accents.filter((name) => name !== "brand"), "danger"].map((name) => (
              <span key={name} className="rounded-full px-2 py-0.5" style={tint(name, dark)}>
                {scaleLabel(name)}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            <span className="block rounded-md border border-(--border) bg-(--card) px-3 py-2 text-(--muted-foreground)">Name eingeben …</span>
            <span className="block rounded-md border border-(--border) bg-(--card) px-3 py-2 ring-2 ring-(--ring) ring-offset-2 ring-offset-(--card)">
              Mit Fokus-Ring
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-2">
              <span className="inline-flex h-5 w-9 items-center rounded-full bg-(--primary) p-0.5">
                <span className="ml-auto size-4 rounded-full bg-(--primary-foreground)" />
              </span>
              An
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-flex h-5 w-9 items-center rounded-full bg-(--border) p-0.5">
                <span className="size-4 rounded-full bg-(--card) shadow-sm" />
              </span>
              Aus
            </span>
          </div>
          <p className="flex gap-2 rounded-md px-3 py-2" style={alertTint(dark)}>
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            Zimmer 4 ist doppelt belegt.
          </p>
        </div>
      </Block>
    </div>
  );
}

/* ────────────── App overview ────────────── */

const navigation = [
  { label: "Übersicht", icon: LayoutDashboard },
  { label: "Belegung", icon: BedDouble },
  { label: "Schichten", icon: CalendarDays },
  { label: "Mitarbeitende", icon: Users },
  { label: "Häuser", icon: Building2 },
  { label: "Einstellungen", icon: Settings },
];

const houses = ["Haus am See", "Alte Mühle", "Stadtloft", "Waldhof", "Seeblick"];

const arrivals = [
  { name: "Lena Brandt", house: "Haus am See", date: "Mo, 29.09.", status: "Bestätigt" },
  { name: "Jonas Keller", house: "Alte Mühle", date: "Di, 30.09.", status: "Offen" },
  { name: "Mira Özdemir", house: "Haus am See", date: "Mi, 01.10.", status: "Neu" },
  { name: "Tim Albers", house: "Stadtloft", date: "Fr, 03.10.", status: "Saison" },
];

const accentAt = (accents: string[], index: number) => accents[index % accents.length];

function Tag({ scale, dark, children }: { scale: string; dark: boolean; children: ReactNode }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={tint(scale, dark)}>
      {children}
    </span>
  );
}

function AppOverview({ accents, dark }: { accents: string[]; dark: boolean }) {
  const stats = [
    { label: "Belegte Betten", value: "42 / 48", hint: "+3 seit gestern", icon: BedDouble },
    { label: "Offene Schichten", value: "7", hint: "2 davon heute", icon: CalendarDays },
    { label: "Anreisen", value: "12", hint: "diese Woche", icon: Users },
  ];
  return (
    <div className="flex bg-(--background) text-sm">
      <aside className="hidden w-48 shrink-0 flex-col gap-0.5 border-r border-(--border) bg-(--card) p-3 @3xl:flex">
        <p className={`${headingFont} mb-5 px-2 pt-1 text-base font-semibold tracking-tight`}>
          Hausbuch<span className="text-(--primary)">.</span>
        </p>
        {navigation.map(({ label, icon: Icon }, index) => (
          <span
            key={label}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${index === 0 ? "bg-(--muted) font-medium" : "text-(--muted-foreground)"}`}
          >
            <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            {label}
          </span>
        ))}
      </aside>

      <div className="min-w-0 flex-1 space-y-5 p-4 @lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-(--muted-foreground)">Montag, 29. September</p>
            <h2 className={`${headingFont} text-2xl font-semibold tracking-tight`}>Übersicht</h2>
          </div>
          <div className="flex gap-2">
            <span className="rounded-md border border-(--border) bg-(--card) px-3 py-2 font-medium">Exportieren</span>
            <span className="rounded-md bg-(--primary) px-3.5 py-2 font-medium text-(--primary-foreground)">Schicht planen</span>
          </div>
        </header>

        <div className="grid gap-3 @lg:grid-cols-3">
          {stats.map(({ label, value, hint, icon: Icon }, index) => {
            const scale = accentAt(accents, index);
            return (
              <div key={label} className="flex gap-3 rounded-xl border border-(--border) bg-(--card) p-4 text-(--card-foreground)">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={tint(scale, dark, "icon")}>
                  <Icon aria-hidden className="size-4.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-(--muted-foreground)">{label}</p>
                  <p className={`${headingFont} text-xl font-semibold tabular-nums`}>{value}</p>
                  <p className="text-xs text-(--muted-foreground)">{hint}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 @3xl:grid-cols-5">
          <div className="rounded-xl border border-(--border) bg-(--card) p-4 @3xl:col-span-3">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className={`${headingFont} font-semibold`}>Belegung nach Haus</h3>
              <span className="text-xs text-(--muted-foreground)">letzte 8 Wochen</span>
            </div>
            <LayerChart accents={accents} dark={dark} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--muted-foreground)">
              {accents.map((scale, index) => (
                <span key={scale} className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full" style={{ background: `var(--${scale}-${dark ? 400 : 600})` }} />
                  {houses[index % houses.length]}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-(--border) bg-(--card) p-4 @3xl:col-span-2">
            <h3 className={`${headingFont} font-semibold`}>Schnell eintragen</h3>
            <div className="space-y-1">
              <p className="text-xs text-(--muted-foreground)">Mitarbeiter:in</p>
              <p className="rounded-md border border-(--border) bg-(--card) px-3 py-2 ring-2 ring-(--ring) ring-offset-2 ring-offset-(--card)">Lena Br</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-(--muted-foreground)">Haus</p>
              <p className="rounded-md border border-(--border) bg-(--muted) px-3 py-2 text-(--muted-foreground)">Haus wählen …</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="font-medium text-(--primary) underline underline-offset-4">Alle Anfragen</span>
              <span className="rounded-md bg-(--destructive) px-3 py-1.5 font-medium text-white">Stornieren</span>
            </div>
            <p className="rounded-md px-3 py-2 text-xs" style={alertTint(dark)}>Zimmer 4 im Stadtloft ist doppelt belegt.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-(--border) bg-(--card)">
          <h3 className={`${headingFont} border-b border-(--border) px-4 py-3 font-semibold`}>Nächste Anreisen</h3>
          {arrivals.map((row, index) => (
            <div key={row.name} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-(--border) px-4 py-2.5 last:border-0 @lg:grid-cols-4">
              <span className="font-medium">{row.name}</span>
              <span className="hidden text-(--muted-foreground) @lg:block">{row.house}</span>
              <span className="hidden text-(--muted-foreground) tabular-nums @lg:block">{row.date}</span>
              <span>
                {index === 0 ? (
                  <span className="rounded-full bg-(--muted) px-2 py-0.5 text-xs font-medium text-(--muted-foreground)">{row.status}</span>
                ) : (
                  <Tag scale={index === 1 ? "brand" : accentAt(accents, index - 2)} dark={dark}>
                    {row.status}
                  </Tag>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Stacked bands in brand steps, like an occupancy chart, plus one line per
 * extra colour. Dark mode mirrors the steps: 950 ground, bands 800 to 400.
 */
function LayerChart({ accents, dark }: { accents: string[]; dark: boolean }) {
  const step = (light: number) => (dark ? 1000 - light : light);
  const bands = [
    { step: 200, top: [70, 72, 74, 70, 60, 58, 56, 55] },
    { step: 300, top: [55, 56, 58, 55, 44, 42, 40, 40] },
    { step: 400, top: [40, 42, 42, 40, 30, 28, 27, 26] },
    { step: 500, top: [26, 27, 28, 26, 16, 15, 14, 14] },
    { step: 600, top: [12, 13, 14, 12, 6, 5, 5, 4] },
  ];
  const x = (i: number) => (i / 7) * 400;
  return (
    <svg viewBox="0 0 400 100" className="h-40 w-full rounded-lg" preserveAspectRatio="none" aria-hidden>
      <rect width="400" height="100" fill={`var(--brand-${dark ? 950 : 50})`} />
      {bands.map((band) => (
        <path key={band.step} fill={`var(--brand-${step(band.step)})`} d={`M0,100 L${band.top.map((y, i) => `${x(i)},${100 - y}`).join(" L")} L400,100 Z`} />
      ))}
      {accents.map((scale, line) => (
        <path
          key={scale}
          d={`M0,${70 - line * 11} ${[34, 38, 36, 44, 50, 47, 56].map((y, i) => `L${x(i + 1)},${100 - y - line * 11 + ((i * (line + 3)) % 7)}`).join(" ")}`}
          fill="none"
          stroke={`var(--${scale}-${step(600)})`}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
