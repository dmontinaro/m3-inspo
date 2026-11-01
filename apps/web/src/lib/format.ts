import { getLocale } from "#/paraglide/runtime.js";

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale() === "de" ? "de-DE" : "en-GB", options).format(value);
}

export function formatDate(value: Date | number, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(getLocale() === "de" ? "de-DE" : "en-GB", { ...options, timeZone: "Europe/Berlin" }).format(value);
}

export type ContentLanguage = "en" | "de";
export function contentLanguageForUi(locale: string): ContentLanguage {
  return locale === "de" ? "de" : "en";
}
