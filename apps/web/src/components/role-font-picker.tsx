import * as m from "#/paraglide/messages.js";
import { useEffect, useId, useState } from "react";
import { Search, X } from "lucide-react";
import { fieldClassName, inputClassName } from "#/lib/form-styles";
import {
  fontCategories,
  fontCategoryLabels,
  fontRoleLabels,
  fontSources,
  standardWeights,
} from "#/lib/fonts";
import type { FontCategory, FontRole, FontSource, RoleFont } from "#/lib/fonts";
import { searchFontCatalog } from "#/server/font-catalog.functions";
import type { CatalogFont } from "#/server/font-catalog.server";
import { StandInBadge, useFontFaces } from "./font-faces";

/** The weight a role starts with when a catalog family is picked: bold for headings, regular otherwise. */
const startWeight: Record<FontRole, number> = { heading: 700, body: 400, mono: 400 };

/** The available weight closest to `target`. */
const nearest = (weights: number[], target: number) =>
  weights.reduce((best, weight) => (Math.abs(weight - target) < Math.abs(best - target) ? weight : best), weights[0] ?? target);

const tabLabels: Record<FontSource, () => string> = { fontsource: m.font_catalogue, adobe: m.font_source_adobe, local: m.font_source_local };

/**
 * One font role of the pairing editor: a catalog search with category
 * filter, or a free-text family for Adobe Fonts and local fonts with a
 * category of its own (default sans) and an optional link to the family's
 * page, captured as its preview, plus the weights the
 * pairing uses. `catalogWeights` are the weights the catalog has for the
 * current family; `onRemove` is set for the optional mono role.
 */
export function RoleFontPicker({
  role,
  value,
  catalogWeights,
  onChange,
  onRemove,
}: {
  role: FontRole;
  value: RoleFont | undefined;
  catalogWeights: number[] | undefined;
  onChange: (font: RoleFont | undefined, catalogWeights?: number[]) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const source = value?.source ?? "fontsource";
  const [searching, setSearching] = useState(!value);
  const { fontStyle } = useFontFaces([value]);

  function switchSource(next: FontSource) {
    if (next === source) return;
    if (next === "fontsource") {
      setSearching(true);
      return onChange(undefined);
    }
    // Adobe and local share the free-text fields; coming from the catalog starts them fresh.
    onChange(
      value && value.source !== "fontsource"
        ? { family: value.family, weights: value.weights, category: value.category, source: next, pageUrl: value.pageUrl }
        : { family: "", weights: [startWeight[role]], category: "sans", source: next },
    );
  }

  function pick(font: CatalogFont) {
    setSearching(false);
    onChange(
      {
        family: font.family,
        weights: [nearest(font.weights, startWeight[role])],
        category: font.category,
        source: "fontsource",
        fontsourceId: font.id,
      },
      font.weights,
    );
  }

  function toggleWeight(weight: number) {
    if (!value) return;
    const weights = value.weights.includes(weight)
      ? value.weights.filter((w) => w !== weight)
      : [...value.weights, weight].sort((a, b) => a - b);
    onChange({ ...value, weights }, catalogWeights);
  }

  const offeredWeights = value?.source === "fontsource" ? (catalogWeights ?? value.weights) : standardWeights;

  return (
    <fieldset className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-sm font-medium text-neutral-900">{fontRoleLabels[role]}</legend>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X aria-hidden className="size-3.5" /> {m.action_remove()}</button>
        )}
      </div>

      <div role="radiogroup" aria-label={m.field_source()} className="mt-3 flex gap-1 rounded-lg bg-neutral-100 p-1 text-xs">
        {fontSources.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === source}
            onClick={() => switchSource(option)}
            className="flex-1 rounded-md px-2 py-1.5 text-neutral-600 hover:text-neutral-900 aria-checked:bg-white aria-checked:font-medium aria-checked:text-neutral-900 aria-checked:shadow-sm"
          >
            {tabLabels[option]()}
          </button>
        ))}
      </div>

      {source === "fontsource" && (
        <div className="mt-3">
          {value && !searching ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-2xl text-neutral-950" style={fontStyle(value)}>
                  {value.family}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                  {fontCategoryLabels[value.category]} {m.font_source_caption()}<StandInBadge font={value} />
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearching(true)}
                className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                {m.font_choose_other()}</button>
            </div>
          ) : (
            <CatalogSearch
              initialCategory={role === "mono" ? "mono" : undefined}
              onPick={pick}
              onCancel={value ? () => setSearching(false) : undefined}
            />
          )}
        </div>
      )}

      {value && value.source !== "fontsource" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-family`} className="text-xs font-medium text-neutral-700">
              {m.font_family()}</label>
            <input
              id={`${id}-family`}
              value={value.family}
              // A new name drops the slug of the family looked up before; the server sets it again on save.
              onChange={(event) => onChange({ ...value, family: event.target.value, adobeSlug: undefined })}
              maxLength={100}
              placeholder={value.source === "adobe" ? m.font_adobe_placeholder() : m.font_family_placeholder()}
              className={fieldClassName}
            />
          </div>
          <div>
            <label htmlFor={`${id}-category`} className="text-xs font-medium text-neutral-700">
              {m.font_category()}</label>
            <select
              id={`${id}-category`}
              value={value.category}
              onChange={(event) =>
                onChange({ ...value, category: fontCategories.find((option) => option === event.target.value) ?? "sans" })
              }
              className={fieldClassName}
            >
              {fontCategories.map((category) => (
                <option key={category} value={category}>
                  {fontCategoryLabels[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-page`} className="text-xs font-medium text-neutral-700">
              {m.font_page_link()}<span className="ml-1 font-normal text-neutral-400">{m.field_optional()}</span>
            </label>
            <input
              id={`${id}-page`}
              inputMode="url"
              value={value.pageUrl ?? ""}
              onChange={(event) => onChange({ ...value, pageUrl: event.target.value })}
              maxLength={2000}
              placeholder={m.font_url_placeholder()}
              className={fieldClassName}
            />
            <p className="mt-1 text-xs text-neutral-500">
              {m.font_page_preview_help()}</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-neutral-500 sm:col-span-2">
            <StandInBadge font={value} />
            {value.source === "adobe"
              ? m.font_adobe_help()
              : m.font_system_category()}
          </p>
        </div>
      )}

      {value && (
        <div className="mt-4">
          <p className="text-xs font-medium text-neutral-700">{m.font_weights()}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {offeredWeights.map((weight) => (
              <button
                key={weight}
                type="button"
                aria-pressed={value.weights.includes(weight)}
                onClick={() => toggleWeight(weight)}
                className="min-w-11 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 tabular-nums hover:border-neutral-500 aria-pressed:border-neutral-900 aria-pressed:bg-neutral-900 aria-pressed:text-white"
              >
                {weight}
              </button>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}

/** How a search result previews its family: regular, or the closest weight the family has. */
const previewFont = (font: CatalogFont): RoleFont => ({
  family: font.family,
  weights: [nearest(font.weights, 400)],
  category: font.category,
  source: "fontsource",
  fontsourceId: font.id,
});

/**
 * Searches the font catalog by name and category as the owner types and
 * lists the families, each in its own typeface (only the one weight shown loads).
 */
function CatalogSearch({
  initialCategory,
  onPick,
  onCancel,
}: {
  initialCategory: FontCategory | undefined;
  onPick: (font: CatalogFont) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [results, setResults] = useState<CatalogFont[]>();
  const [failed, setFailed] = useState(false);
  const previews = (results ?? []).map((font) => ({ font, preview: previewFont(font) }));
  const { fontStyle } = useFontFaces(previews.map(({ preview }) => preview));

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      searchFontCatalog({ data: { query, category } }).then(
        (fonts) => {
          if (!current) return;
          setResults(fonts);
          setFailed(false);
        },
        () => current && setFailed(true),
      );
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, category]);

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            aria-label={m.font_search()}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder={m.font_search()}
            className={`${inputClassName} pl-8`}
          />
        </div>
        <div className="w-32 shrink-0">
          <select
            aria-label={m.font_category()}
            value={category ?? ""}
            onChange={(event) => setCategory(fontCategories.find((option) => option === event.target.value))}
            className={inputClassName}
          >
            <option value="">{m.filter_all()}</option>
            {fontCategories.map((option) => (
              <option key={option} value={option}>
                {fontCategoryLabels[option]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {failed ? (
        <p className="mt-3 text-sm text-rose-700">{m.font_search_failed()}</p>
      ) : results?.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{m.font_search_empty()}</p>
      ) : (
        <ul className="mt-2 max-h-64 overflow-y-auto">
          {previews.map(({ font, preview }) => (
            <li key={font.id}>
              <button
                type="button"
                onClick={() => onPick(font)}
                className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100"
              >
                <span className="truncate text-lg text-neutral-900" style={fontStyle(preview)}>
                  {font.family}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">{fontCategoryLabels[font.category]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {onCancel && (
        <button type="button" onClick={onCancel} className="mt-2 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900">
          {m.action_cancel()}</button>
      )}
    </div>
  );
}
