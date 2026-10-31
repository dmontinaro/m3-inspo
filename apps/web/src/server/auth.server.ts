/**
 * Better Auth for the single owner. GitHub is the only sign-in method and
 * only the GitHub account `OWNER_GITHUB_ID` may register or sign in; every
 * other account is turned away before a user or session row is written.
 * Mounted at /api/auth/* (routes/api/auth/$.ts).
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import * as authSchema from "@m3-inspo/db/auth-schema";
import { getDb } from "@m3-inspo/db/client";
import { notOwnerError, signInPath } from "#/lib/sign-in";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
  emailAndPassword: { enabled: false },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  user: {
    // Runs on sign-up, sign-in and account linking with the fresh GitHub profile.
    validateUserInfo: ({ source }) => {
      const githubId = source.oauth?.providerId === "github" ? source.oauth.profile?.id : undefined;
      if (githubId !== undefined && String(githubId) === process.env.OWNER_GITHUB_ID) return;
      return { error: notOwnerError, errorDescription: "Only the owner may sign in." };
    },
  },
  onAPIError: { errorURL: signInPath },
  // Better Auth turns its origin check off under NODE_ENV=test; keep it on so tests see production behaviour.
  advanced: { disableOriginCheck: false },
  plugins: [tanstackStartCookies()], // must stay last
});
