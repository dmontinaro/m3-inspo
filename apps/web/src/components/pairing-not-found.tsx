import * as m from "#/paraglide/messages.js";
import { Link } from "@tanstack/react-router";

/** What the pairing pages show for an unknown slug. */
export function PairingNotFound() {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-xl font-semibold">{m.pairing_not_found()}</h1>
      <Link to="/type-pairings" className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4">
        {m.pairings_back()}</Link>
    </main>
  );
}
