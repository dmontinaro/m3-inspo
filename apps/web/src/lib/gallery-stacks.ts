/** One tile of the plain gallery: a loose reference or the stack of a collection. */
export type GalleryItem<TCard, TCollection> =
  | { kind: "reference"; reference: TCard }
  | { kind: "stack"; collection: TCollection };

/**
 * Folds the references of each collection into one stack. A stack takes the
 * place of its first member in `cards` (so newest first, like the gallery);
 * references in no collection stay loose tiles. A reference in several
 * collections shows up in each of their stacks. `collections` decides which
 * stacks exist and their order when one reference opens several.
 */
export function stackCollections<TCard extends { collections: string[] }, TCollection extends { slug: string }>(
  cards: TCard[],
  collections: TCollection[],
): GalleryItem<TCard, TCollection>[] {
  const placed = new Set<string>();
  return cards.flatMap((card): GalleryItem<TCard, TCollection>[] => {
    const own = collections.filter((collection) => card.collections.includes(collection.slug));
    if (own.length === 0) return [{ kind: "reference", reference: card }];
    return own.flatMap((collection) => {
      if (placed.has(collection.slug)) return [];
      placed.add(collection.slug);
      return [{ kind: "stack", collection }];
    });
  });
}
