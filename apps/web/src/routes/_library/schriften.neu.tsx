import { createFileRoute } from "@tanstack/react-router";
import { PairingEditor } from "#/components/pairing-editor";

export const Route = createFileRoute("/_library/schriften/neu")({
  head: () => ({ meta: [{ title: "Neues Pairing · m3 inspo" }] }),
  component: () => <PairingEditor />,
});
