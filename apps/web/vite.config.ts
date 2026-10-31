import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Nitro builds a Node server (.output/server/index.mjs) that Railway runs via `pnpm start`.
// Its plugin starts the job runner (AI analysis, embeddings) with the server.
// Test mode leaves Nitro out, so Vitest runs the app in-process (src/test/app.ts)
// and tests run analysis and embedding jobs themselves.
export default defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    mode !== "test" && nitro({ plugins: ["./src/server/job-runner.plugin.ts"] }),
    tailwindcss(),
    paraglideVitePlugin({ project: "./project.inlang" }),
    tanstackStart(),
    viteReact(),
  ],
}));
