import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/server/auth.server";

// Better Auth endpoints (GitHub sign-in, callback, session, sign-out).
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
