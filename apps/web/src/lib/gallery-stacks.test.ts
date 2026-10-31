import { describe, expect, it } from "vitest";
import { stackCollections } from "./gallery-stacks";
import type { GalleryItem } from "./gallery-stacks";

const card = (slug: string, ...collections: string[]) => ({ slug, collections });
const shape = (items: GalleryItem<{ slug: string }, { slug: string }>[]) =>
  items.map((item) => (item.kind === "stack" ? `stack:${item.collection.slug}` : item.reference.slug));

describe("stacking collections in the gallery", () => {
  it("puts each stack where its newest member was and keeps loose references in place", () => {
    const cards = [card("a"), card("b", "hotels"), card("c"), card("d", "hotels"), card("e", "fonts")];
    const collections = [{ slug: "fonts" }, { slug: "hotels" }];

    expect(shape(stackCollections(cards, collections))).toEqual(["a", "stack:hotels", "c", "stack:fonts"]);
  });

  it("opens every collection of a reference that sits in several, in the collections' order", () => {
    const cards = [card("a", "hotels", "fonts"), card("b", "hotels")];
    const collections = [{ slug: "fonts" }, { slug: "hotels" }];

    expect(shape(stackCollections(cards, collections))).toEqual(["stack:fonts", "stack:hotels"]);
  });

  it("leaves a reference loose when its collection is not known", () => {
    expect(shape(stackCollections([card("a", "gone")], []))).toEqual(["a"]);
  });
});
