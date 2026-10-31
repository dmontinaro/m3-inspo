# Paraglide im vorhandenen Start- und Nitro-Stack

Paraglide 2.29.3 funktioniert mit den vorhandenen Paketversionen. Englisch als Basissprache, Deutsch per Cookie und der Sprachkontext für parallele SSR- und direkte Server-Function-Aufrufe sind praktisch nachgewiesen. Ein Wechsel des Start- oder Nitro-Stacks ist für diesen Integrationsweg nicht erforderlich.

Dies ist ein verwerfbarer technischer Spike für [das Prüfticket](https://github.com/dmontinaro/m3-inspo/issues/3), keine fertige Produktmigration. Der Branch wird nicht gemergt.

## Geprüfter Stand

- Ausgangsbasis: `5dbb6303364d66216c16eb207e71b1dfdf9b57bc`.
- Geprüfter Source-Commit: `877fde459b6f8f29ee3c02f3151eb203684df3cc`.
- Prüfdatum: 31. Oktober 2026, Europe/Berlin.
- Node `26.12.1`, pnpm `11.5.3`, PostgreSQL 17 mit pgvector.
- Paraglide `2.29.3`, Message-Format-Plugin `4.5.0`.
- Unverändert: TanStack Start `1.168.57`, Router `1.170.38`, Vite `8.3.0`, Nitro `3.0.260903-beta`, React `19.3.0`, TypeScript `6.0.3`.

Der Source-Checkout war vor und nach den abschließenden Prüfungen sauber. Dieser Bericht und das unverändert übernommene Production-Prüfskript wurden anschließend als Nachweis ergänzt.

## Funktionierender Integrationsweg

1. [Inlang settings](../../apps/web/project.inlang/settings.json) setzen `baseLocale: "en"`, `locales: ["en", "de"]` und versionieren die URL des Message-Format-Plugins.
2. [Paraglide config](../../apps/web/project.inlang/paraglide.config.ts) setzt `strategy: ["cookie", "baseLocale"]`, `PARAGLIDE_LOCALE`, `SameSite=lax` und `cookieSecure: "auto"`. Ohne gültigen Cookie gilt Englisch, auch bei deutschem `Accept-Language`.
3. [Vite config](../../apps/web/vite.config.ts) behält Nitro und Tailwind bei. `paraglideVitePlugin` steht vor `tanstackStart()` und `viteReact()`.
4. [Server entry](../../apps/web/src/server.ts) legt den Sprachkontext um den gesamten Start-Handler. Die vorhandenen Schutzprüfungen in `src/start.ts` bleiben unverändert.

```ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";

export default createServerEntry({
  fetch(request, options) {
    return paraglideMiddleware(request, () => handler.fetch(request, options));
  },
});
```

Der Wrapper reicht die vorhandenen `options` weiter. Die Cookie-Strategie benötigt hier keinen umgeschriebenen Request. Diese Form funktioniert mit dem tatsächlich installierten Start-Handler.

5. Das Root-Dokument verwendet `getLocale()` für `<html lang>`. Einige Login-Texte und eine Validierung dienen als übersetzte Proben.
6. `emitTsDeclarations: true` erzeugt Typdeklarationen für die generierten JavaScript-Module. `pnpm i18n:compile` läuft vor Router-Generierung und TypeScript. `project.inlang/paraglide.config.ts` muss zusätzlich in `tsconfig.json.include` stehen, damit auch das typisierte ESLint die Konfigurationsdatei prüfen kann.
7. Generierte `src/paraglide`-Dateien bleiben aus Git und ESLint ausgeschlossen. Der Vite-Build generiert sie selbst; der Typecheck besitzt seinen eigenen Compiler-Schritt.

## Nachweise

| Prüfung | Ergebnis |
| --- | --- |
| Erste Generierung ohne vorhandenen Inlang-Projektcache | Erfolgreich |
| Typecheck ohne vorab generierte Paraglide-Ausgabe | Erfolgreich, Compiler läuft vor TypeScript |
| Abschließender projektweiter `heavy-check pnpm typecheck` | Exit 0 auf dem geprüften Source-Commit |
| Gezieltes ESLint der geänderten TypeScript-Dateien | Erfolgreich |
| Paraglide-Integration und bestehende Zugriffsprüfungen | 4 Testdateien, 40 bestanden, 30 durch den Namensfilter ausgelassen |
| Abschließender `heavy-check pnpm build` | Exit 0, Client, SSR und Nitro-Server erzeugt |
| Gestarteter Nitro-Output per HTTP | Erfolgreich, einschließlich 24 paralleler SSR-Anfragen |

Die [sieben neuen Integrationstests](../../apps/web/src/paraglide-spike.test.ts) prüfen Standard, beide Cookies und ungültigen Cookie, jeweils mit passendem HTML und Logintext. 24 gleichzeitige direkte POST-Aufrufe der Probe-Server-Function behalten ihre Sprache über ein `await` hinweg und liefern die passende Zod-Fehlermeldung. Der Validator entsteht dabei innerhalb des Request-Kontexts, nicht einmalig beim Modulimport.

Zusätzlich laufen vorhandene Prüfungen für Eigentümerzugriff, GitHub-Anmeldung, CSRF sowie MCP- und Worker-Zugriff. Die 30 ausgelassenen Tests liegen außerhalb des gewählten Namensfilters; dies ist kein Nachweis der vollständigen Testsuite.

Der Production-Check startet `apps/web/.output/server/index.mjs` mit einer eigenen temporären Datenbank und synthetischen Zugangswerten. Er prüft die Sprachwahl einschließlich ungültigem Cookie, `html lang`, ausbleibende Sprachredirects und parallele SSR-Anfragen. Der Eigentümer-Redirect erhält den Querystring. MCP und Worker antworten ohne Token weiterhin mit 401 und ohne Loginredirect, der Worker mit gültigem synthetischem Token mit 200.

Der Build meldet Warnungen zur bestehenden `inputValidator`-API, die auch die Probe verwendet, und zu `use client` beim Bundling. Der Build und die beschriebenen Laufzeitprüfungen bestehen trotzdem.

## Wiederholen

In einer isolierten Kopie dieses Branches `pnpm install --frozen-lockfile` ausführen. Einen eigenen temporären PostgreSQL-17-Container mit pgvector auf einem freien lokalen Port starten. Die folgenden Beispiele verwenden `54331`; vorher dessen Verfügbarkeit prüfen.

```sh
heavy-check pnpm typecheck

TEST_DATABASE_SERVER_URL=postgres://postgres:postgres@127.0.0.1:54331 \
pnpm exec vitest run \
  apps/web/src/paraglide-spike.test.ts \
  apps/web/src/owner-access.test.ts \
  apps/web/src/mcp-access.test.ts \
  apps/web/src/import-jobs.test.ts \
  --testNamePattern 'Paraglide against|without a session|cross-site requests|GitHub sign-in|access to /api/mcp|access to /api/worker' \
  --fileParallelism=false

heavy-check pnpm build

SPIKE_POSTGRES_CONTAINER=<own-disposable-container> \
python3 scripts/paraglide-production-check.py .
```

Das [Production-Prüfskript](../../scripts/paraglide-production-check.py) benötigt Python 3, Docker und einen PostgreSQL-Superuser `postgres` mit Passwort `postgres` im eigenen Container. Es legt die Datenbank `paraglide_production_spike` neu an; pro Durchlauf einen frischen Container verwenden. `SPIKE_POSTGRES_PORT` und `SPIKE_SERVER_PORT` ändern die Standardports `54331` und `33331`. Der Serverport muss frei sein. Das Skript beendet seinen eigenen Nitro-Prozess auch bei fehlgeschlagenen Assertions. Anschließend den eigenen Container stoppen und die Freigabe beider Ports separat prüfen.

## Grenzen und Konsequenz für die Planung

- Kein Browsernachweis für Hydration, Sprachwechsel oder den Schutz ungespeicherter Eingaben. Dafür bleibt das eigene Prototyp-Ticket zuständig.
- Kein separater Lauf unter Node 24, das die vorhandene CI verwendet. Vor der Produktübernahme bleibt dieser CI-Nachweis erforderlich.
- Keine vollständige Übersetzung und keine Migration der Routen. `/anmelden` bleibt im Spike absichtlich erhalten. Das Produkt soll gemeinsame englische Routen ohne Sprachpräfix verwenden.
- Die lokalisierte Validierung ist eine Probe. Sprache für Hintergrundjobs, gespeicherte Fehler und KI-Texte ist weiterhin fachlich festzulegen.
- Kein Deployment, keine vollständige Testsuite und kein Merge.

Die Spec kann diesen Integrationsweg übernehmen. Aus dem Spike entsteht kein zusätzlicher technischer Blocker für die offenen Entscheidungen der Map.

Der Haupt-Checkout blieb unverändert. Nach dem Lauf wurden alle 308 zuvor erfassten Dateien per SHA256 gegen den Ausgangsstand geprüft. Der eigene temporäre Container wurde entfernt; die ursprünglich freien Ports `54331` und `33331` wurden mit einem separaten Kommando wieder als frei bestätigt.
