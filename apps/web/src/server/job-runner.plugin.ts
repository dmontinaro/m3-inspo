/**
 * Nitro plugin (registered in vite.config.ts): starts the background work
 * with the web server and stops it on shutdown. The daily font catalog sync
 * (font-catalog.server.ts) always runs; with ADOBE_FONTS_API_TOKEN the Adobe
 * preview kit is brought up to date once. The job runner runs AI analyses only
 * with ANTHROPIC_API_KEY and embeddings only with EMBEDDINGS_API_KEY; with
 * neither it does not start, and no such jobs are created.
 */

import { definePlugin } from "nitro";
import { embeddingsEnabled } from "@m3-inspo/db/vector";
import { claudeVision } from "./analysis-model.server";
import { adobeFontsEnabled } from "./adobe-fonts.server";
import { startFontCatalogSync } from "./font-catalog.server";
import { startJobRunner } from "./job-runner.server";
import { analysisEnabled } from "./library.server";
import { syncAdobePreviewKit } from "./type-pairings.server";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("close", startFontCatalogSync());
  if (adobeFontsEnabled()) {
    syncAdobePreviewKit().then(
      (added) => console.info(`[adobe-fonts] preview kit synced, ${added.length} families added`),
      (error: unknown) => console.warn("[adobe-fonts] preview kit sync failed:", error),
    );
  }

  if (!analysisEnabled() && !embeddingsEnabled()) {
    console.info("[jobs] off: neither ANTHROPIC_API_KEY nor EMBEDDINGS_API_KEY is set");
    return;
  }
  const stop = startJobRunner({ vision: analysisEnabled() ? claudeVision() : null, embeddings: embeddingsEnabled() });
  nitroApp.hooks.hook("close", stop);
});
