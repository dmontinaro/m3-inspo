import { createFileRoute } from "@tanstack/react-router";
import { getStorage, isValidKey } from "#/server/storage.server";

/**
 * Streams a stored image: /api/assets/<storage key>. The global owner gate
 * (src/start.ts) answers 401 without the owner's session before this runs.
 * Only keys in the app's own format are looked up; the folder storage also
 * refuses anything outside its root.
 * Keys never change content, so the browser may keep them, but only privately.
 */
export const Route = createFileRoute("/api/assets/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params._splat ?? "";
        const object = isValidKey(key) ? await getStorage().read(key) : null;
        if (!object) return new Response("Not found", { status: 404 });

        const headers = new Headers({
          "content-type": object.contentType,
          "cache-control": "private, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        });
        if (object.size !== undefined) headers.set("content-length", String(object.size));
        return new Response(object.body, { headers });
      },
    },
  },
});
