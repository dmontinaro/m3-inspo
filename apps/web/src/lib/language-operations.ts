/** Browser-only in-flight operations. Accepted background jobs are not registered here. */
export const languageOperations = new Set<"mutation" | "upload" | "oauth">();
let nextOperation = 0;
const activeMutations = new Map<number, "mutation" | "upload" | "oauth">();

/** Multiple concurrent server functions keep the blocker until the last response settles. */
export function beginLanguageOperation(kind: "mutation" | "upload" | "oauth"): () => void {
  const id = nextOperation++;
  activeMutations.set(id, kind);
  languageOperations.add(kind);
  return () => {
    activeMutations.delete(id);
    if (![...activeMutations.values()].includes(kind)) languageOperations.delete(kind);
  };
}

export let confirmedLanguageReload = false;
export function allowLanguageReload() {
  confirmedLanguageReload = true;
}
