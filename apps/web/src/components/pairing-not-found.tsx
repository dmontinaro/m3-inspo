import { Link } from "@tanstack/react-router";

/** What the pairing pages show for an unknown slug. */
export function PairingNotFound() {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-xl font-semibold">Pairing nicht gefunden</h1>
      <Link to="/schriften" className="mt-4 inline-block text-sm text-neutral-600 underline underline-offset-4">
        Zu den Schriften
      </Link>
    </main>
  );
}
