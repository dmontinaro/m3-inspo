import { describe, expect, it } from "vitest";
import { z } from "zod";
import { paraglideMiddleware } from "../paraglide/server.js";
import { getLocale } from "../paraglide/runtime.js";
import { contentLanguageForUi, formatDate, formatNumber } from "../lib/format";
import { issueMessage, validationProblem, webValidator } from "../lib/validation";

const title = z.object({ title: z.string().trim().min(1).max(200) });
async function localized(locale: string, read: () => unknown | Promise<unknown>) {
  const response = await paraglideMiddleware(new Request("https://inspo.example", { headers: { cookie: `PARAGLIDE_LOCALE=${locale}`, "accept-language": "de-DE" } }), async () => Response.json(await read() ?? null));
  return response.json();
}

describe("request-time formatting and validation", () => {
  it("isolates overlapping requests after a shared schema import and await", async () => {
    const results = await Promise.all(Array.from({ length: 24 }, (_, index) => localized(index % 2 ? "de" : "en", async () => {
      await new Promise((resolve) => setTimeout(resolve, index % 4));
      const parsed = title.safeParse({ title: "x".repeat(201) });
      if (parsed.success) throw new Error("Expected invalid title");
      return { locale: getLocale(), problem: validationProblem(parsed.error.issues[0]), text: issueMessage(parsed.error.issues[0]), number: formatNumber(1234.5) };
    })));
    results.forEach((value, index) => {
      const result = z.object({ locale: z.enum(["en", "de"]), problem: z.unknown(), text: z.string(), number: z.string() }).parse(value);
      expect(result.problem).toEqual({ code: "too_long", field: "title", limit: 200 });
      expect(result.locale).toBe(index % 2 ? "de" : "en");
      expect(result.text).toBe(index % 2 ? "Verwende für Titel höchstens 200 Zeichen." : "Use at most 200 characters for Title.");
      expect(result.number).toBe(index % 2 ? "1.234,5" : "1,234.5");
    });
  });

  it.each(["en", "de"])("localizes early validators and Berlin dates for %s", async (locale) => {
    await localized(locale, () => {
      expect(() => webValidator(title)({ title: "" })).toThrow(locale === "de" ? "Bitte fülle Titel aus." : "Enter a value for Title.");
      const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false };
      expect(formatDate(new Date("2026-01-01T23:30:00Z"), options)).toBe(locale === "de" ? "02.01.2026, 00:30" : "02/01/2026, 00:30");
      expect(formatDate(new Date("2026-07-01T22:30:00Z"), options)).toBe(locale === "de" ? "02.07.2026, 00:30" : "02/07/2026, 00:30");
    });
  });

  it.each(["", "xx", "fr"])("uses English for invalid cookie %j regardless of Accept-Language", async (locale) => {
    await localized(locale, () => {
      expect(getLocale()).toBe("en");
    });
    expect(contentLanguageForUi(locale)).toBe("en");
  });
});
