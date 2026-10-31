import logoUrl from "#/assets/m3-inspo-logo.svg?url";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "#/lib/auth-client";
import { notOwnerError, returnPath, signInPath } from "#/lib/sign-in";

export const Route = createFileRoute("/anmelden")({
  validateSearch: z.object({ error: z.string().optional(), next: z.string().optional() }),
  component: SignIn,
});

const errorMessages: Record<string, string> = {
  [notOwnerError]: "Dieses GitHub-Konto hat keinen Zugang.",
};

function SignIn() {
  const { error, next } = Route.useSearch();
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL: returnPath(next),
      errorCallbackURL: signInPath,
    });
    // On success the browser is already on its way to GitHub.
    if (result.error) setPending(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1>
          <img src={logoUrl} alt="m3 inspo" width={1520} height={432} className="h-8 w-auto" />
        </h1>
        <p className="mt-3 text-sm text-neutral-600">Private Designbibliothek</p>

        {error && (
          <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessages[error] ?? "Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal."}
          </p>
        )}

        <button
          type="button"
          onClick={signIn}
          disabled={pending}
          className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Weiter zu GitHub …" : "Mit GitHub anmelden"}
        </button>
      </div>
    </main>
  );
}
