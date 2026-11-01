import { handleAuthRequest } from "#/server/auth-return.server";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/server/auth.server";

// Better Auth endpoints (GitHub sign-in, callback, session, sign-out).
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request, auth.handler),
      POST: ({ request }) => handleAuthRequest(request, auth.handler),
    },
  },
});
