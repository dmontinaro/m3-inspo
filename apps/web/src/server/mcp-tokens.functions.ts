import { parseWeb, webValidator } from "#/lib/validation";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { newTokenFields } from "#/lib/mcp-token-fields";
import { createToken, listTokens, revokeToken } from "./mcp-tokens.server";

/** Server functions for the settings page. The global owner gate has already let the caller in. */

export const listMcpTokens = createServerFn({ method: "GET" }).handler(() => listTokens());

/** Takes the settings form; answers `{ token, credential }` with `token` in plaintext, shown to the owner once. */
export const createMcpToken = createServerFn({ method: "POST" })
  .validator((data: FormData) => parseWeb(newTokenFields, data instanceof FormData ? Object.fromEntries(data) : data))
  .handler(({ data }) => createToken(data));

export const revokeMcpToken = createServerFn({ method: "POST" })
  .validator(webValidator(z.object({ id: z.uuid() })))
  .handler(({ data }) => revokeToken(data.id));
