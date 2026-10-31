/**
 * The one owner check. The global `ownerGate` in src/start.ts runs it for
 * every request, so pages, server functions and API routes are covered
 * without opting in.
 */

import { getDb } from "@m3-inspo/db/client";
import { auth } from "./auth.server";

/** `image` is the GitHub avatar URL better-auth stored at sign-in, if any. */
export type Owner = { id: string; name: string; image: string | null };

/**
 * Returns the owner behind the request's session, or null. A session only
 * counts while its user is linked to the GitHub account `OWNER_GITHUB_ID`,
 * so changing the owner ends older sessions.
 */
export async function findOwner(headers: Headers): Promise<Owner | null> {
  const ownerGithubId = process.env.OWNER_GITHUB_ID;
  if (!ownerGithubId) return null;

  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const ownerAccount = await getDb().query.account.findFirst({
    columns: { id: true },
    where: (account, { and, eq }) =>
      and(eq(account.userId, session.user.id), eq(account.providerId, "github"), eq(account.accountId, ownerGithubId)),
  });
  if (!ownerAccount) return null;

  const { id, name, image } = session.user;
  return { id, name, image: image ?? null };
}
