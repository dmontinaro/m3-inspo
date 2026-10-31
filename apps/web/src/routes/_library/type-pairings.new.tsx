import * as m from "#/paraglide/messages.js";
import { createFileRoute } from "@tanstack/react-router";
import { PairingEditor } from "#/components/pairing-editor";

export const Route = createFileRoute("/_library/type-pairings/new")({
  head: () => ({ meta: [{ title: m.pairing_new_page_title() }] }),
  component: () => <PairingEditor />,
});
