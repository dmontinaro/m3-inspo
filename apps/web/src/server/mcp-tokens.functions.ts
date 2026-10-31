import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { maxTokenNameLength, tokenLifetimeDays } from "#/lib/mcp-tokens";
import { createToken, listTokens, revokeToken } from "./mcp-tokens.server";

/** Server functions for the settings page. The global owner gate has already let the caller in. */

export const listMcpTokens = createServerFn({ method: "GET" }).handler(() => listTokens());

/** The settings form: a name and one of the offered lifetimes (form values arrive as strings). */
const newTokenForm = z.object({
  name: z.string().trim().min(1).max(maxTokenNameLength),
  expiresInDays: z.coerce.number().pipe(z.literal(tokenLifetimeDays)),
});

/** Takes the settings form; answers `{ token, credential }` with `token` in plaintext, shown to the owner once. */
export const createMcpToken = createServerFn({ method: "POST" })
  .validator((data: FormData) => newTokenForm.parse(Object.fromEntries(data)))
  .handler(({ data }) => createToken(data));

export const revokeMcpToken = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) => revokeToken(data.id));
