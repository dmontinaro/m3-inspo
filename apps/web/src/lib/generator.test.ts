/**
 * The generator's state logic at the seam the page uses: URL in, draft out
 * and back, undo history, locks and extra colours. Pure, no database.
 */

import { describe, expect, it } from "vitest";
import { parseGeneratorSearch, serializeGeneratorSearch } from "@m3-inspo/shared/color-scheme";
import type { PoolColor } from "@m3-inspo/shared/color-scheme";
import {
  addExtra,
  adjustColor,
  cycleLock,
  describeSkipped,
  draftFromScheme,
  draftFromSearch,
  hasSchemeParams,
  isSameScheme,
  moveExtra,
  paletteSearch,
  record,
  renameExtra,
  rollDraft,
  searchFromDraft,
  startHistory,
  takeFromReference,
  undo,
} from "./generator";
import type { PoolData } from "./generator";
import { parseSearch, stringifySearch } from "./search";

const hotel = { id: "id-hotel", slug: "hotel-am-see", title: "Hotel am See", thumbUrl: "/t/hotel.webp", imageUrl: "/o/hotel.png" };
const colors: PoolColor[] = [
  { hex: "#e56236", measuredBy: "dom", referenceId: hotel.id },
  { hex: "#2f7d6d", measuredBy: "dom", referenceId: hotel.id },
  { hex: "#6b4eff", measuredBy: "vision", referenceId: hotel.id },
  { hex: "#d9a441", measuredBy: "vision", referenceId: hotel.id },
  { hex: "#8a7a72", measuredBy: "dom", referenceId: hotel.id },
];
const data: PoolData = {
  references: [hotel],
  colors,
  linked: { references: [hotel], colors },
  collections: [{ slug: "ruhige-hotels", name: "Ruhige Hotels" }],
  projects: ["harbor"],
};

/** The URL as the browser holds it, read back the way the generator route reads it. */
const throughRouter = (search: string) => parseGeneratorSearch(parseSearch(stringifySearch(parseSearch(search))));

const read = (search: string, poolData = data) => draftFromSearch(parseSearch(search), poolData);

describe("the generator URL", () => {
  it("restores exactly the colours, locks, names, strategy, seed and pool it wrote", () => {
    const { draft, skipped } = read(
      "?brand=e56236~hue@hotel-am-see&neutral=112233&extras=teal:2f7d6d~exact,12e456&primary=hold&seed=42&pool=collection:ruhige-hotels",
    );
    expect(skipped).toEqual([]);
    const written = serializeGeneratorSearch(searchFromDraft(draft, { kind: "collection", slug: "ruhige-hotels" }, data.linked.references));
    const { state } = throughRouter(`?${written}`);

    expect(state).toEqual({
      brand: { hex: "#e56236", lock: "hue", reference: "hotel-am-see" },
      neutral: { hex: "#112233", lock: "open" },
      extras: [
        { name: "teal", hex: "#2f7d6d", lock: "exact" },
        { name: draft.sources.extras[1]?.name, hex: "#12e456", lock: "open" },
      ],
      primary: "hold",
      seed: 42,
      pool: { kind: "collection", slug: "ruhige-hotels" },
    });
  });

  it("reads origins: a known reference with its measurement, exact by hand, open as rolled", () => {
    const { draft } = read("?brand=e56236@hotel-am-see&neutral=8a7a72~exact&extras=teal:2f7d6d&seed=7");
    expect(draft.sources.brand.origin).toEqual({ kind: "reference", referenceId: hotel.id, measuredBy: "dom" });
    expect(draft.sources.neutral.origin).toEqual({ kind: "manual" });
    expect(draft.sources.extras[0]?.origin).toEqual({ kind: "rolled", seed: 7 });
  });

  it("opens a broken link: rolls the unreadable colour, keeps one with an unknown reference and names what it skipped", () => {
    const { draft, skipped } = read("?brand=zz9&neutral=8a7a72@gone-ref&extras=teal:2f7d6d~open&pool=nope-a,hotel-am-see&seed=3");

    expect(draft.sources.brand.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(draft.sources.neutral).toEqual({ hex: "#8a7a72", lock: "open", origin: { kind: "rolled", seed: 3 } });
    expect(draft.sources.extras.map((extra) => extra.hex)).toEqual(["#2f7d6d"]);
    expect(skipped.map(describeSkipped)).toEqual([
      'Could not read Brand "zz9". Rolled again.' ,
      'Part of Extra colour "teal:2f7d6d~open" could not be read.' ,
      "Reference gone-ref is unknown. Colour kept.",
      "Pool nope-a is unknown.",
    ]);
  });

  it("rolls an unreadable extra in its place instead of dropping it", () => {
    const { draft, skipped } = read("?brand=e56236&neutral=8a7a72&extras=teal:2f7d6d,@nohex,salbei:8a9a7b&seed=3");

    expect(draft.sources.extras).toHaveLength(3);
    expect(draft.sources.extras[0]).toMatchObject({ name: "teal", hex: "#2f7d6d" });
    expect(draft.sources.extras[1]).toMatchObject({ lock: "open", hex: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    expect(draft.sources.extras[1]?.name).not.toMatch(/^(teal|salbei)$/);
    expect(draft.sources.extras[2]).toMatchObject({ name: "salbei", hex: "#8a9a7b" });
    // A token that starts with `@` is not a reference of a readable colour.
    expect(skipped.map(describeSkipped)).toEqual(['Could not read Extra colour "@nohex". Rolled again.' ]);
  });

  it("names an unknown collection as pool", () => {
    const empty: PoolData = { ...data, references: [], colors: [] };
    expect(read("?brand=e56236&neutral=8a7a72&pool=collection:weg&seed=1", empty).skipped.map(describeSkipped)).toEqual([
      "Pool collection:weg is unknown.",
    ]);
  });
});

describe("a reference's palette as the start", () => {
  it("takes every colour exactly from the reference: first colourful as brand, greyest as neutral, the rest as extras", () => {
    const search = paletteSearch(["#1D4A66", "#e8f1f7", "#ffffff", "#2a7fb8", "#8a7a72", "#1d4a66", "#e8a52a"], hotel.slug);
    const { draft, pool, skipped } = draftFromSearch({ ...search, seed: 1 }, data);

    expect(skipped).toEqual([]);
    expect(pool).toEqual({ kind: "references", slugs: [hotel.slug] });
    expect(draft.sources.brand).toMatchObject({ hex: "#1d4a66", lock: "exact", origin: { kind: "reference", referenceId: hotel.id } });
    expect(draft.sources.neutral).toMatchObject({ hex: "#e8f1f7", lock: "exact", origin: { kind: "reference" } });
    expect(draft.sources.extras.map(({ hex, lock }) => [hex, lock])).toEqual([
      ["#2a7fb8", "exact"],
      ["#8a7a72", "exact"],
      ["#e8a52a", "exact"],
    ]);
  });

  it("keeps five extras and leaves a missing neutral to the roll", () => {
    const { state } = parseGeneratorSearch(paletteSearch(["#e56236", "#2f7d6d", "#6b4eff", "#d9a441", "#8a9a7b", "#c2185b", "#0277bd"], hotel.slug));
    expect(state.brand?.hex).toBe("#e56236");
    expect(state.neutral).toBeNull();
    expect(state.extras.map((extra) => extra.hex)).toEqual(["#2f7d6d", "#6b4eff", "#d9a441", "#8a9a7b", "#c2185b"]);
  });
});

describe("undo", () => {
  const { draft } = read("?brand=e56236&neutral=8a7a72&seed=1");

  it("takes one drag back in one step, and two drags in two", () => {
    let history = startHistory(draft);
    for (const hex of ["#e06030", "#d85a2a", "#d05020"]) history = record(history, adjustColor(history.present, "brand", hex), 1);
    expect(history.present.sources.brand.hex).toBe("#d05020");
    history = record(history, adjustColor(history.present, "brand", "#c04010"), 2);

    history = undo(history);
    expect(history.present.sources.brand.hex).toBe("#d05020");
    history = undo(history);
    expect(history.present).toEqual(draft);
  });

  it("steps back over every roll", () => {
    let history = startHistory(draft);
    history = record(history, rollDraft(history.present, colors, 11));
    history = record(history, rollDraft(history.present, colors, 12));
    expect(undo(undo(history)).present).toEqual(draft);
    expect(undo(startHistory(draft)).present).toEqual(draft);
  });
});

describe("source colours", () => {
  const { draft } = read("?brand=e56236&neutral=8a7a72&extras=teal:2f7d6d&seed=1");

  it("cycles the lock open → hue → exact → open", () => {
    const locks = [draft];
    for (let i = 0; i < 3; i++) locks.push(cycleLock(locks.at(-1)!, 0));
    expect(locks.map((d) => d.sources.extras[0]?.lock)).toEqual(["open", "hue", "exact", "open"]);
  });

  it("locks a colour adjusted by hand exactly", () => {
    expect(adjustColor(draft, "neutral", "#7a6a62").sources.neutral).toEqual({ hex: "#7a6a62", lock: "exact", origin: { kind: "manual" } });
  });

  it("lets a suggested name follow its colour, keeps a name given by hand", () => {
    const named = read("?brand=e56236&neutral=8a7a72&extras=green:16a34a,wald:15803d&seed=1").draft;
    const moved = adjustColor(adjustColor(named, 0, "#0d9488"), 1, "#0d9488");
    expect(moved.sources.extras.map((extra) => extra.name)).toEqual(["teal", "wald"]);
    // Back to its colour, back to its name: a step the picker's "Wie vorher" takes too.
    expect(adjustColor(moved, 0, "#16a34a").sources.extras[0]?.name).toBe("green");
  });

  it("moves suggested names on a roll without two extras landing on the same name", () => {
    const open = read("?brand=e56236&neutral=8a7a72&extras=green:16a34a,lime:65a30d&seed=1").draft;
    for (const seed of [3, 4, 5, 6]) {
      const names = rollDraft(open, colors, seed).sources.extras.map((extra) => extra.name);
      expect(new Set(names).size).toBe(2);
    }
  });

  it("rolls only a newly added extra, with a free name, and stops at five", () => {
    const added = addExtra(draft, colors, 99);
    expect(added.sources.brand).toEqual(draft.sources.brand);
    expect(added.sources.neutral).toEqual(draft.sources.neutral);
    expect(added.sources.extras[0]).toEqual(draft.sources.extras[0]);
    expect(added.sources.extras).toHaveLength(2);
    expect(added.sources.extras[1]?.name).not.toBe("teal");
    expect(added.seed).toBe(99);

    let full = added;
    for (let seed = 100; seed < 110; seed++) full = addExtra(full, colors, seed);
    expect(full.sources.extras).toHaveLength(5);
    expect(new Set(full.sources.extras.map((extra) => extra.name)).size).toBe(5);
  });

  it("moves an extra to another place among the extras and nowhere else", () => {
    const three = read("?brand=e56236&neutral=8a7a72&extras=teal:2f7d6d,violet:6b4eff,amber:d9a441").draft;
    const names = (d: typeof three) => d.sources.extras.map((extra) => extra.name);
    expect(names(moveExtra(three, 0, 2))).toEqual(["violet", "amber", "teal"]);
    expect(names(moveExtra(three, 2, 0))).toEqual(["amber", "teal", "violet"]);
    expect(moveExtra(three, 0, 2).sources.brand).toBe(three.sources.brand);
    expect(moveExtra(three, 1, 1)).toBe(three);
    expect(moveExtra(three, 0, 3)).toBe(three);
  });
});

describe("colours from a reference", () => {
  const { draft } = read("?brand=e56236&neutral=8a7a72&extras=teal:2f7d6d&seed=1");
  /** The draft through its link and back, as a reload does. */
  const reloaded = (next: typeof draft) => {
    const written = serializeGeneratorSearch(searchFromDraft(next, { kind: "all" }, data.references));
    return { written, draft: read(`?${written}`).draft };
  };

  it("takes a measured colour with its measurement, locked exactly, and keeps it through a reload", () => {
    const taken = takeFromReference(draft, "brand", "#6b4eff", hotel.id, colors);
    expect(taken.sources.brand).toEqual({
      hex: "#6b4eff",
      lock: "exact",
      origin: { kind: "reference", referenceId: hotel.id, measuredBy: "vision" },
    });

    const { written, draft: back } = reloaded(taken);
    expect(written).toContain("brand=6b4eff~exact@hotel-am-see");
    expect(back.sources.brand).toEqual(taken.sources.brand);
  });

  it("takes a pipette pixel as an exact colour from the reference's image, the extra keeps a name given by hand", () => {
    const taken = takeFromReference(renameExtra(draft, 0, "lagune"), 0, "#1d6b5a", hotel.id, colors);
    expect(taken.sources.extras[0]).toEqual({
      name: "lagune",
      hex: "#1d6b5a",
      lock: "exact",
      origin: { kind: "reference", referenceId: hotel.id, measuredBy: "image" },
    });

    const { written, draft: back } = reloaded(taken);
    expect(written).toContain("extras=lagune:1d6b5a~exact@hotel-am-see");
    expect(back.sources.extras[0]).toEqual(taken.sources.extras[0]);
  });

  it("adds no undo step for taking the colour it already is", () => {
    const history = record(startHistory(draft), takeFromReference(draft, "brand", "#6b4eff", hotel.id, colors));
    expect(record(history, takeFromReference(history.present, "brand", "#6b4eff", hotel.id, colors))).toBe(history);
  });

  it("counts a pipette pixel the palette holds as measured, as the link reads it", () => {
    expect(takeFromReference(draft, "neutral", "#8a7a72", hotel.id, colors).sources.neutral.origin).toEqual({
      kind: "reference",
      referenceId: hotel.id,
      measuredBy: "dom",
    });
  });
});

describe("a saved kit", () => {
  // As the server stores it: the orange from the hotel, a rolled neutral (its seed long gone from any URL), a teal set by hand.
  const saved = draftFromScheme({
    sources: {
      brand: { hex: "#e56236", lock: "hue", origin: { kind: "reference", referenceId: hotel.id, measuredBy: "dom" } },
      neutral: { hex: "#8a7a72", lock: "exact", origin: { kind: "rolled", seed: 11 } },
      extras: [{ name: "teal", hex: "#2f7d6d", lock: "exact", origin: { kind: "manual" } }],
    },
    primary: "vivid",
  });

  it("reopened from the link its page writes is unchanged", () => {
    const search = parseSearch(`?${serializeGeneratorSearch(searchFromDraft(saved, { kind: "all" }, [hotel]))}`);

    expect(hasSchemeParams(search)).toBe(true);
    expect(isSameScheme(draftFromSearch(search, data).draft, saved)).toBe(true);
    expect(hasSchemeParams(parseSearch("?pool=project:harbor&seed=4"))).toBe(false);
  });

  it("stays the saved state for a link without colours, e.g. a hand-written strategy or empty extras", () => {
    for (const search of ["?primary=vivid", "?primary=hold&seed=4", "?extras=", "?brand=&pool=all"])
      expect(hasSchemeParams(parseSearch(search)), search).toBe(false);
    for (const search of ["?brand=e56236", "?neutral=8a7a72~exact", "?extras=teal:2f7d6d"])
      expect(hasSchemeParams(parseSearch(search)), search).toBe(true);
  });

  it("counts a new colour, lock, name or strategy as a change, and is unchanged again once discarded", () => {
    const changes = [
      rollDraft(saved, colors, 5),
      cycleLock(saved, "brand"),
      renameExtra(saved, 0, "salbei"),
      { ...saved, primary: "hold" as const },
    ];
    for (const changed of changes) expect(isSameScheme(changed, saved)).toBe(false);

    // "Verwerfen" puts the saved draft back as a step of its own.
    const discarded = record(record(startHistory(saved), changes[0]), saved);
    expect(isSameScheme(discarded.present, saved)).toBe(true);
    expect(isSameScheme(undo(discarded).present, saved)).toBe(false);
  });
});
