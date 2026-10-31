import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";

/** Spike-only endpoint: force asynchronous overlap before localized validation. */
export const probeLocale = createServerFn({ method: "POST" })
  .inputValidator(z.object({ title: z.string(), delay: z.number().int().min(0).max(100) }))
  .handler(async ({ data }) => {
    const before = getLocale();
    await new Promise((resolve) => setTimeout(resolve, data.delay));
    const parsed = z.object({ title: z.string().min(1, m.spike_title_required()) }).safeParse(data);
    return {
      before,
      after: getLocale(),
      errors: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
    };
  });
