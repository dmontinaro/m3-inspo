import { createFileRoute } from "@tanstack/react-router";
import { PairingNotFound } from "#/components/pairing-not-found";
import { getTypePairing } from "#/server/type-pairings.functions";
import { PairingDetailView } from "./type-pairings.$slug.index";

export const Route = createFileRoute("/_library/type-pairings/new/view")({
  loader: () => getTypePairing({ data: { slug: "new" } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.name} · m3 inspo` : "m3 inspo" }] }),
  component: ExistingNewPairing,
  notFoundComponent: PairingNotFound,
});

function ExistingNewPairing() {
  const pairing = Route.useLoaderData();
  return <PairingDetailView pairing={pairing} />;
}
