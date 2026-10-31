import { createFileRoute } from "@tanstack/react-router";
import { PairingEditor } from "#/components/pairing-editor";
import { PairingNotFound } from "#/components/pairing-not-found";
import { roleEntries } from "#/components/pairing-poster";
import { getCatalogFonts } from "#/server/font-catalog.functions";
import { getTypePairing } from "#/server/type-pairings.functions";

export const Route = createFileRoute("/_library/type-pairings/$slug/edit")({
  loader: async ({ params }) => {
    const pairing = await getTypePairing({ data: { slug: params.slug } });
    const ids = roleEntries(pairing.roles).flatMap(({ font }) => (font.fontsourceId ? [font.fontsourceId] : []));
    const catalog = await getCatalogFonts({ data: { ids: [...new Set(ids)] } });
    return { pairing, catalogWeights: Object.fromEntries(catalog.map((font) => [font.id, font.weights])) };
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.pairing.name} bearbeiten · m3 inspo` : "m3 inspo" }] }),
  component: EditPairing,
  notFoundComponent: PairingNotFound,
});

// Editing reuses the new-pairing page, filled with the pairing.
function EditPairing() {
  const { pairing, catalogWeights } = Route.useLoaderData();
  return <PairingEditor pairing={pairing} catalogWeights={catalogWeights} />;
}
