import { describe, expect, it } from "vitest";
import { parseSearch, stringifySearch } from "./search";

describe("search params", () => {
  it.each([
    ["an all-digit hex", "112233"],
    ["a hex with leading zeros", "001122"],
    ["a hex that reads like an exponent", "12e456"],
    ["a word JSON would turn into a boolean", "true"],
    ["a colour token", "teal:2f7d6d~exact@harbor-app,salbei:8a9a7b"],
  ])("reads back %s exactly as written", (_, value) => {
    expect(parseSearch(stringifySearch({ value }))).toEqual({ value });
  });

  it("keeps numbers, booleans and objects the router writes", () => {
    const search = { seed: 42, favorites: true, filter: { tags: ["hotel"] } };
    expect(parseSearch(stringifySearch(search))).toEqual(search);
  });

  it("does not turn a hand-written exponent-like hex into a number", () => {
    // generate_color_scheme writes its links without the router: `brand=12e456`.
    expect(parseSearch("?brand=12e456&neutral=123e45")).toEqual({ brand: "12e456", neutral: "123e45" });
  });

  it("leaves `:`, `@` and `,` readable in the URL", () => {
    expect(stringifySearch({ extras: "teal:2f7d6d@ref-a,salbei:8a9a7b", q: "ruhige hotels" })).toBe(
      "?extras=teal:2f7d6d@ref-a,salbei:8a9a7b&q=ruhige%20hotels",
    );
  });
});
