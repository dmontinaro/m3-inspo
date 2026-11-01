import { beginLanguageOperation } from "#/lib/language-operations";
import { LanguageControl } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import logoUrl from "#/assets/m3-inspo-logo.svg?url";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "#/lib/auth-client";
import { notOwnerError, returnPath, signInUrl } from "#/lib/sign-in";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({ error: typeof search.error === "string" ? search.error : undefined, next: search.next === undefined ? undefined : returnPath(search.next) }),
  component: SignIn,
});

const errorMessages: Record<string, string> = {
  get [notOwnerError]() { return m.sign_in_not_owner(); },
};

function SignIn() {
  const { error, next } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const finish = beginLanguageOperation("oauth");
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: returnPath(next),
        errorCallbackURL: signInUrl(next),
      });
      // Keep the blocker while the browser leaves for GitHub.
      if (result.error) { finish(); setPending(false); setFailed(true); }
    } catch {
      finish(); setPending(false); setFailed(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1>
          <img src={logoUrl} alt="m3 inspo" width={1520} height={432} className="h-8 w-auto" />
        </h1>
        <p className="mt-3 text-sm text-neutral-600">{m.sign_in_description()}</p>

        {(error || failed) && (
          <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {(error && errorMessages[error]) || m.sign_in_failed()}
          </p>
        )}

      <LanguageControl />
        <button
          type="button"
          onClick={signIn}
          disabled={pending}
          className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? m.sign_in_pending() : m.sign_in_action()}
        </button>
      </div>
    </main>
  );
}
