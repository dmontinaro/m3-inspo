import { z } from "zod";
import { maxTokenNameLength, tokenLifetimeDays } from "./mcp-tokens";

/** Neutral settings-form rules, used before submission and at the server boundary. */
export const newTokenFields = z.object({
  name: z.string().trim().min(1).max(maxTokenNameLength),
  expiresInDays: z.coerce.number().pipe(z.literal(tokenLifetimeDays)),
});
