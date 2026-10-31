import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
  outdir: "./src/paraglide",
  emitTsDeclarations: true,
  strategy: ["cookie", "baseLocale"],
  cookieName: "PARAGLIDE_LOCALE",
  cookieSameSite: "lax",
  cookieSecure: "auto",
});
