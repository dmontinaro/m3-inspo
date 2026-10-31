/**
 * Replaces GitHub at the network boundary (global `fetch`), so the real
 * Better Auth GitHub flow runs in tests without calling github.com.
 * The OAuth `code` in the callback decides which account signs in.
 *
 * ```ts
 * useFakeGithub([owner, stranger]);
 * await signInWithGithub(browser, owner);
 * ```
 */

import { vi } from "vitest";
import { returnPath, signInPath } from "../lib/sign-in";
import { testOrigin } from "./app";
import type { TestBrowser } from "./app";

export type GithubAccount = { id: number; login: string; name: string; email: string };

const githubCodeFor = (account: GithubAccount) => `code-${account.id}`;

/**
 * Clicks "Mit GitHub anmelden" on `signInPage` (the sign-in URL, with the
 * `next` the gate put there) and returns from GitHub as `githubAccount`.
 * Returns the callback response.
 */
export async function signInWithGithub(browser: TestBrowser, githubAccount: GithubAccount, signInPage = signInPath) {
  const next = new URL(signInPage, testOrigin).searchParams.get("next") ?? undefined;
  const start = await browser.post("/api/auth/sign-in/social", {
    provider: "github",
    callbackURL: returnPath(next),
    errorCallbackURL: signInPath,
  });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  return browser.get(`/api/auth/callback/github?code=${githubCodeFor(githubAccount)}&state=${state}`);
}

export function useFakeGithub(accounts: GithubAccount[]) {
  const realFetch = globalThis.fetch;
  const byToken = new Map(accounts.map((account) => [`token-${account.id}`, account]));

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!url.hostname.endsWith("github.com")) return realFetch(input, init);

    if (url.href === "https://github.com/login/oauth/access_token") {
      const code = new URLSearchParams(String(init?.body)).get("code");
      const account = accounts.find((candidate) => githubCodeFor(candidate) === code);
      if (!account) return Response.json({ error: "bad_verification_code" });
      return Response.json({ access_token: `token-${account.id}`, token_type: "bearer", scope: "read:user,user:email" });
    }

    const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
    const account = byToken.get(token);
    if (!account) return Response.json({ message: "Bad credentials" }, { status: 401 });

    if (url.href === "https://api.github.com/user") {
      const { id, login, name, email } = account;
      return Response.json({ id, login, name, email, avatar_url: `https://avatars.githubusercontent.com/u/${id}` });
    }
    if (url.href === "https://api.github.com/user/emails") {
      return Response.json([{ email: account.email, primary: true, verified: true }]);
    }
    throw new Error(`Unexpected GitHub request in test: ${url.href}`);
  });
}
