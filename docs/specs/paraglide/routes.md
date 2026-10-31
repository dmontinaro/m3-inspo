# Englische Routen und Weiterleitungen

Entscheidungsdokument zu [Englische Routen und Weiterleitungen verbindlich zuordnen](https://github.com/dmontinaro/m3-inspo/issues/4), Teil der [Paraglide-Planung](https://github.com/dmontinaro/m3-inspo/issues/2).

Stand der geprüften Quellen: `3151aa30dc20c4f2d73e35974c52915bc02650b0` auf `main`. Die folgenden Detailentscheidungen trifft der Agent unter dem ausdrücklich beauftragten Autopilot. Sie sind keine Behauptung eines Interviews, eines Nutzertests oder einer persönlichen Freigabe des Eigentümers. Dieses Dokument plant die spätere Migration. Es implementiert keine Routen oder Redirects.

## Verbindliche Grundregeln

- Englisch und Deutsch verwenden dieselben englischen Seitenpfade ohne Sprachpräfix. Die Sprache kommt aus dem Browser-Cookie mit Englisch als Standard, nicht aus dem Pfad oder `Accept-Language`.
- Die Galerie bleibt `/`. Es entstehen weder `/references` als zusätzliche Liste noch eigene Seiten für bereits eingebettete Dialoge und Editoren.
- `references`, `collections` und `type-pairings` benennen die bestehenden Objekte. `type-pairings` ist genauer als `fonts`, weil dort gespeicherte Schriftkombinationen und kein Schriftkatalog liegen. `add` passt zur vorhandenen Seite mit Bild-Upload und URL-Import besser als `upload`.
- Gespeicherte Slugs, Namen, Projekt-Tags, Referenzdaten und Query-Werte bleiben unverändert. Beispielsweise bleibt `zimmeruebersicht` auch in einer englischen URL `zimmeruebersicht`.
- Bereits kopierte deutsche Links bleiben durch dauerhafte Redirects nutzbar. Neu erzeugte Links zeigen sofort auf das englische Ziel. Die Redirects haben kein Ablaufdatum.
- API-Pfade, Server-Function-Aufrufe, MCP-Toolnamen und deren Feldnamen, Auth-Verträge, Storage-Keys und `INSPO_*` bleiben stabil.

## Vollständige Bestandsaufnahme und Zuordnung

Alle Dateinamen dieser beiden Tabellen sind relativ zu `apps/web/src/routes/`. `$slug` steht für denselben gespeicherten Slug auf beiden Seiten. Die kanonische Schreibweise hat außer bei `/` keinen abschließenden Slash. `.index` und der abschließende Slash in einer `createFileRoute`-ID erzeugen keinen zusätzlichen URL-Abschnitt.

| Bestehende Route-Datei | Heutiger Pathname | Kanonischer englischer Pathname | Entscheidung |
| --- | --- | --- | --- |
| `_library/index.tsx` | `/` | `/` | Galerie einschließlich Filter, bleibt bestehen |
| `_library/referenzen.$slug.tsx` | `/referenzen/$slug` | `/references/$slug` | Referenzdetail; Bearbeiten, Bereiche und KI-Analyse bleiben eingebettet |
| `_library/sammlungen.index.tsx` | `/sammlungen` | `/collections` | Sammlungsliste; Anlegen bleibt im bestehenden Formular |
| `_library/sammlungen.$slug.tsx` | `/sammlungen/$slug` | `/collections/$slug` | Sammlungsdetail; Bearbeiten bleibt eingebettet |
| `_library/schriften.index.tsx` | `/schriften` | `/type-pairings` | Liste der Type Pairings |
| `_library/schriften.neu.tsx` | `/schriften/neu` | `/type-pairings/new` | Neues Type Pairing, statische Route hat Vorrang |
| `_library/schriften.$slug.index.tsx` | `/schriften/$slug` | `/type-pairings/$slug` | Detail, mit Ausnahme `new` in der folgenden Zeile |
| Dieselbe dynamische Detaildatei, Slug `new` | `/schriften/new` | `/type-pairings/new/view` | Festes Ausweichziel für den erlaubten bestehenden Slug `new` |
| `_library/schriften.$slug.bearbeiten.tsx` | `/schriften/$slug/bearbeiten` | `/type-pairings/$slug/edit` | Editierformular, auch `/schriften/new/bearbeiten` → `/type-pairings/new/edit` |
| `_library/brand-kits.index.tsx` | `/brand-kits` | `/brand-kits` | Liste, bleibt bestehen; Anlegen geschieht im Generator |
| `_library/brand-kits.$slug.tsx` | `/brand-kits/$slug` | `/brand-kits/$slug` | Detail und eingebetteter Editor, bleiben bestehen |
| `_library/generator.tsx` | `/generator` | `/generator` | Generator, bleibt bestehen |
| `_library/hochladen.tsx` | `/hochladen` | `/add` | Hinzufügen per Bild oder URL |
| `_library/importe.tsx` | `/importe` | `/imports` | Importaufträge |
| `_library/einstellungen.tsx` | `/einstellungen` | `/settings` | Einstellungen einschließlich MCP-Zugang |
| `_library/werkzeuge.tsx` | `/werkzeuge` | `/tools` | Vorhandene Hilfeseite zu Agent-Werkzeugen |
| `anmelden.tsx` | `/anmelden` | `/sign-in` | Öffentliche GitHub-Anmeldung |

Diese 16 Seiten-Dateien bilden 16 Seitenmuster. Die zusätzliche Tabellenzeile präzisiert eine mögliche Slug-Kollision innerhalb eines vorhandenen Musters.

| Bestehende Route-Datei oder Ressource | Bestehender Pfad | Behandlung |
| --- | --- | --- |
| `__root.tsx` | Kein eigener Pfad | HTML-Dokument und Root-Layout; kein `/__root` |
| `_library.tsx` | Kein eigener Pfad | Geschütztes Layout; kein `/_library`, kein `/library` |
| `api/auth/$.ts` | `/api/auth/*` | Unverändert, Better Auth, GET und POST |
| `api/assets/$.ts` | `/api/assets/*` | Unverändert, geschützte Bilder über GET |
| `api/mcp.ts` | `/api/mcp` | Unverändert, MCP mit GET, POST und DELETE |
| `api/worker/$.ts` | `/api/worker/*` | Unverändert, eigene Token- oder Signaturprüfung für alle Methoden |
| `public/` und Root-Head | `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, weitere statische Build-Ressourcen | Keine Seitenmigration; Pfade und Auslieferung bleiben bestehen |
| Generierte Server Functions | Vom Framework erzeugte Aufruf-URLs | Keine Sprach- oder Seitenweiterleitung, auch nicht bei GET |
| Unbekannte Seite | Zum Beispiel `/does-not-exist` oder `/referenzen/x/extra` | Kein erfundener Alias; nach dem Owner-Gate 404 |
| Fehlendes Objekt auf bekannter Detailseite | Zum Beispiel `/referenzen/geloescht` | Erst 308 auf `/references/geloescht`, dort nach Auth 404; kein DB-Lookup für den Alias |

Die vier API-Dateien, zwei Layout-Dateien und 16 Seiten-Dateien erfassen alle 22 vorhandenen Route-Dateien. Es gibt keine eigene Not-found-Datei. Referenz-, Sammlungs-, Pairing- und Brand-Kit-Details definieren ihre Fehleransichten in den vorhandenen Routen beziehungsweise `PairingNotFound`. Deren Rücklinks werden ebenfalls englisch. Es entstehen keine künstlichen `/not-found`, `/help`, `/edit` für Referenzen, `/collections/new` oder `/brand-kits/new`.

### Slugs und die Kollision mit `new`

`server/slug.ts` erzeugt Slugs aus Kleinbuchstaben, Zahlen und Bindestrichen. `server/type-pairings.server.ts` reserviert bisher ausschließlich `neu`; `new`, `edit` und `bearbeiten` können gespeicherte Slugs sein. Ein Umbenennen dieser Daten wäre eine unnötige Inhaltsmigration.

Agent-Entscheidung: `/type-pairings/new` ist immer das Anlegeformular. Das Detail des Slugs `new` liegt fest auf `/type-pairings/new/view`, auch wenn das Objekt aktuell nicht existiert. Diese eine statische Ausnahme benötigt weder DB-Abfrage bei Redirects noch eine allgemeine alternative Detailstruktur. Das Editieren dieses Objekts liegt wie gewohnt auf `/type-pairings/new/edit`. Jeder Linkgenerator für Pairing-Details berücksichtigt die Ausnahme.

Für neue Pairings reserviert die spätere Implementierung `neu` und `new`; bestehende Slugs bleiben erhalten. Die vorhandene Suffix-Regel behandelt neue Namen mit diesen Basisslugs. `edit`, `view` und `bearbeiten` sind als Slugs erlaubt: `/type-pairings/edit`, `/type-pairings/view` und `/type-pairings/bearbeiten` sind Details, `/type-pairings/edit/edit` ist ein Editor. Die Anzahl und Position der Segmente sind eindeutig. Die Zeichenfolge `neu` wird nur als komplette alte Anlegeroute übersetzt, niemals innerhalb eines Slugs.

## Redirect-Vertrag

1. Eine serverseitige, datenunabhängige Zuordnung erkennt ausschließlich die bekannten alten Seitenmuster. Sie läuft für tatsächliche Seitenaufrufe vor dem Owner-Gate, damit auch unangemeldete alte Links zuerst ihr englisches Ziel erreichen. `/anmelden` bleibt dafür als Alias erreichbar; `/sign-in` ist künftig der öffentliche Seitenpfad.
2. GET und HEAD erhalten `308 Permanent Redirect` mit relativem, internem `Location`-Header. HEAD liefert keinen Body. Die Zuordnung hängt weder von Sprache noch Sitzung ab und setzt keinen Sprach-Cookie. Sie übernimmt die bestehenden `noindex`-Header.
3. POST, PUT, PATCH, DELETE, OPTIONS, sämtliche API- und Server-Function-Aufrufe durchlaufen keine Seitenmigration. Sie behalten ihre zuständigen Handler und Zugriffskontrollen. Der Seitenalias darf insbesondere keine Mutation nach `/sign-in` oder auf einen neuen Seitenpfad umleiten.
4. Nur feste Segmente werden ersetzt. Ein optionaler einzelner abschließender Slash wird beim selben Redirect entfernt. Statische Segmente werden ohne Beachtung der Großschreibung erkannt und englisch kleingeschrieben, entsprechend dem vorhandenen Router-Matching. Dynamische Slugs werden nie kleingeschrieben oder übersetzt. Die kanonischen englischen Seiten akzeptieren denselben optionalen Schluss-Slash und leiten ihn in einem Schritt auf die Form ohne Schluss-Slash um. Zusätzliche leere Segmente werden durch diese Migration nicht bereinigt.
5. Das Ziel wird mit dem ursprünglichen rohen Search-String genau einmal zusammengesetzt. Keine Verarbeitung über das Router-Search-Objekt, keine Übersetzung, kein Sortieren, kein zweites `?`, kein Anhängen derselben Parameter. Auch unbekannte oder mehrfache Query-Keys bleiben beim Redirect erhalten. Die normale Zielseite darf ihre bisherigen fachlichen Validierungsregeln anwenden.
6. Eine bereits kanonische URL erhält keinen Migrationsredirect. Die Abbildung ist idempotent: Erneutes Anwenden ändert das Ergebnis nicht. Insbesondere werden `/generator`, `/brand-kits` und `/` nicht zu sich selbst umgeleitet. Der vorhandene Generator-Redirect zum Ergänzen eines fehlenden `seed` bleibt eine eigene fachliche Aktion.
7. Nur vollständige Muster stimmen überein. `/referenzen/x/extra` wird nicht durch pauschales Ersetzen von `/referenzen` verändert. Ein ungültiger oder unbekannter Pfad durchläuft die bestehende Auth-/404-Behandlung. Eine unbekannte Referenz auf einem gültigen Muster braucht dagegen keinen DB-Nachweis für ihren 308.

### Kodierte Pfadsegmente

Der Matcher trennt Segmente vor dem Dekodieren und dekodiert ein Segment höchstens einmal. Er vergleicht feste Segmente mit den bekannten Routennamen und prüft dynamische Slugs gegen das bestehende Format `[a-z0-9]+(?:-[a-z0-9]+)*`. Er dekodiert niemals den gesamten Pfad, um danach erneut an `/` zu trennen.

Damit bleibt etwa `/referenzen/zimmer%75ebersicht` dasselbe Objekt `zimmeruebersicht`. Das Ziel verwendet dessen normale Slug-Schreibweise. Auch ein kodiertes `new` muss dieselbe Pairing-Ausnahme erhalten. `%2F`, `%5C`, rohe Backslashes, Punktsegmente, Steuerzeichen, fehlerhafte Prozentkodierung und doppelt kodierte Separatoren ergeben keinen Migrationsredirect. Sie dürfen weder zusätzliche Segmente noch einen Host oder ein anderes Objekt erzeugen. Prozentzeichen sind kein gültiger gespeicherter Slug; wiederholtes Dekodieren ist unnötig.

Diese Prüfung betrifft Pfadsegmente, nicht Query-Inhalte. Ein `q=foo%2Fbar`, ein verschachtelter `next` oder eine URL in einem Suchwert bleibt unverändert. Der Server sieht keinen URL-Fragmentteil. Ein Link `...#section` darf deshalb kein künstliches Fragment im `Location`-Header erhalten; der Browser übernimmt ein vorhandenes Fragment beim Redirect. Bei clientseitiger Kanonisierung und einem geprüften `next` bleibt das Fragment erhalten.

## Anmeldung und `next`

Der Bestand in `lib/sign-in.ts`, `start.ts`, `routes/anmelden.tsx`, `server/auth.server.ts` und `components/owner-menu.tsx` ist zusammen zu migrieren. Derzeit erzeugt `signInUrl` `/anmelden?next=...`, das Owner-Gate antwortet für unangemeldete Seiten-GETs mit 307, und `returnPath` begrenzt den Rückweg auf dieselbe Origin. Der Sign-in-Button übergibt `callbackURL` an Better Auth. `errorCallbackURL` und `onAPIError.errorURL` zeigen bisher ohne Rückweg auf `/anmelden`.

### Gemeinsame Prüfung und Kanonisierung

Agent-Entscheidung: Neue Anmelde-Links und das Konsumieren von `next` verwenden dieselbe reine Funktion für sichere interne Rückwege. Dieselbe Seitenzuordnung gilt server- und clientseitig. Die Funktion liefert einen kanonischen internen Pfad mit Search und optionalem Hash, bei ungültigen Werten `/`.

- `next` muss ein einzelner String mit genau einem führenden `/` sein. Absolute URLs einschließlich derselben Origin, `//host`, `/\\host`, andere Schemes, Steuerzeichen, rohe Backslashes, ungültige Kodierung und Punktsegmente werden abgewiesen. Nicht nachträglich trimmen oder wiederholt dekodieren, um einen ungültigen Wert gültig zu machen.
- Die äußere Query wird genau einmal als Query gelesen. Danach wird `next` als URL-Pfad analysiert, nicht nochmals mit `decodeURIComponent` als Ganzes dekodiert. Die Segmentprüfung entspricht dem Redirect-Matcher. Ein Origin-Vergleich mit einer festen internen Basis ergänzt die Prüfung. Niemals einen unkontrollierten Host aus `next` in `Location` übernehmen.
- Erlaubt sind die bekannten geschützten Seitenmuster dieser Entscheidung, sowohl alt als auch englisch. Der Pfad wird englisch kanonisiert, sein Search und Hash bleiben erhalten. Die Existenz eines Objekts wird nicht geprüft. Unbekannte Seiten, API-, Asset- und Server-Function-Ziele führen zu `/`.
- `/anmelden`, `/sign-in` und deren Slash-/Kodierungsvarianten sind keine Rückziele. Es gibt keine rekursive Auswertung eines weiteren `next`. Mehrfache äußere `next`-Werte sind mehrdeutig und führen zu `/`.
- Ein Query-Key namens `next` innerhalb des erlaubten Zielpfads ist nur dessen Query-Inhalt. Er wird nicht als neue Anweisung interpretiert. `/generator?pool=collection:sommer` bleibt beispielsweise vollständig erhalten.

### Ablauf und Rückwegerhalt

1. `/referenzen/hotel?x=1` erhält 308 auf `/references/hotel?x=1`. Ohne Sitzung folgt dort 307 auf `/sign-in?next=%2Freferences%2Fhotel%3Fx%3D1`. Für HEAD gilt derselbe geschützte Seitenpfad ohne Body. `/` benötigt weiter kein `next`.
2. Ein neu erzeugtes `signInUrl` enthält nur ein geprüftes, bereits englisches `next`. Das äußere `URLSearchParams` kodiert diesen einen Wert einmal. Seine innere Query wird weder kopiert noch zusätzlich an die Anmeldeseite angehängt.
3. Ein alter Link `/anmelden?next=%2Fsammlungen%2Fsommer%3Fx%3D1&error=not_owner` erhält zunächst 308 auf `/sign-in` mit exakt derselben Query. Die neue Anmeldeseite konsumiert den alten Rückweg sicher als `/collections/sommer?x=1`. Der Alias verändert keine verschachtelten Daten und verliert `next` nicht.
4. Der Sign-in-Button übergibt ausschließlich den geprüften kanonischen Rückweg als `callbackURL`. `errorCallbackURL` zeigt auf `/sign-in` und enthält denselben geprüften Rückweg, sofern er nicht `/` ist. Ein wiederholbarer OAuth-Fehler behält damit das ursprüngliche Ziel für den nächsten Versuch; der maschinelle Fehlercode bleibt etwa `not_owner`. Ein Fehlerhinweis darf `next` nicht überschreiben. Der globale `onAPIError.errorURL` zeigt ebenfalls auf `/sign-in`; die spätere Umsetzung muss den Rückwegerhalt für fehlgeschlagene, bereits gestartete Anmeldeversuche einschließlich dieses Fehlerpfads nachweisen, statt ihn stillschweigend nur im Erfolgsfall zu erhalten.
5. Der bestehende Better-Auth-Schutz gegen fremde direkte `callbackURL`-Werte bleibt aktiv, auch wenn jemand die Anmeldeseite umgeht. `/api/auth/callback/github`, die konfigurierte OAuth-Callback-URL, Provider, Token- und Cookie-Verträge bleiben unverändert.
6. Abmelden zeigt künftig auf `/sign-in`, ohne ein altes Rückziel zu erfinden. Eine bereits bestehende Sitzung erzeugt keine neue automatische Schleife zwischen Startseite und Anmeldung. Der Sprachwechsel auf der Anmeldeseite erhält die vorhandene Query einschließlich des sicheren Rückwegs.

Der 307 des Owner-Gates ist vorübergehend und bleibt vom permanenten 308 der Pfadmigration getrennt. Sichere vorhandene deutsche `next`-Werte werden normalisiert und benutzt. Sie werden weder wegen ihres alten Pfads auf `/` verworfen noch bei einem Alias-Redirect entfernt. Ungültige oder gefährliche Rückwege haben ausdrücklich den Fallback `/`.

## Query-Verträge

| Verbraucher und Quellen | Bestehende Keys und Werte | Migrationsregel |
| --- | --- | --- |
| Galerie, `_library/index.tsx` | `status=draft\|approved\|archived`, `favorites=true`, `device=desktop\|mobile`, `tag`, `collection`, `q` | Keys, boolesche Werte, Slugs und Freitext bleiben gleich; sichtbare Labels werden später übersetzt |
| Anmeldung, `lib/sign-in.ts`, `anmelden.tsx` | `next`, `error`, insbesondere `not_owner` | Keys und Fehlercode bleiben stabil; nur der geprüfte Seitenpfad im konsumierten oder neu erzeugten `next` wird kanonisiert |
| Generator und Brand-Kit-Detail, `lib/generator.ts`, `packages/shared/src/color-scheme/url.ts` | `brand`, `neutral`, `extras`, `primary`, `seed`, `pool`; am Kit zusätzlich `pairing` | Unverändert; Kit und Generator akzeptieren weiterhin ihren bestehenden Zustand |
| Color-Scheme-Tokens | `hex`, `~hue`, `~exact`, `@reference-slug`, optionale Namen in `extras`; `primary=hold\|vivid` | Keine Übersetzung und keine allgemeine URL-Dekodierung der Tokenwerte |
| Pool | `all`, `project:<tag>`, `collection:<slug>`, kommagetrennte Referenz-Slugs | Präfixe und Inhalte bleiben gleich |
| Signierte lokale Worker-Uploads, `storage.server.ts` und API-Route | `expires`, `signature` | Keine Verarbeitung durch den Seitenredirect; signierte URLs dürfen nicht verändert werden |
| Better Auth und Storage-Anbieter | Eigene Callback-, OAuth- und Signaturparameter | Bestehende Verträge, keine Seitenmigration |

`lib/search.ts` hält bereits die Typen der Router-Query und Farben wie `12e456` verlustfrei. Die spätere Migration ersetzt diesen Parser nicht. HTTP-Redirects bewahren den rohen Search-String; neu erzeugte App-Links verwenden weiterhin die vorhandenen Serializer. Ihre vorhandene Kodierung von `:`, `@` und `,` bleibt erhalten. Die URL enthält keine neue Sprach-Query wie `locale=de`.

## Linkquellen und Migrationsgrenze

Die folgende Liste erfasst die im Bestand erzeugten oder ausgegebenen URL-Arten. "Öffentlich kopiert" bedeutet außerhalb der App weitergegeben, nicht ohne Anmeldung lesbar. Die private Bibliothek bleibt privat.

| Quelle | Bestehende Links oder URL-Felder | Spätere Änderung |
| --- | --- | --- |
| `_library.tsx`, `components/owner-menu.tsx`, alle Seitenrouten | Header, Avatar-Menü, Zurücklinks, Listen-/Detailkarten, Galerie-Filter, Empty States und 404-Rücklinks | Ziele nach Tabelle, `/` und Query-Verträge bleiben gleich |
| `components/pairing-editor.tsx`, `pairing-not-found.tsx`, `brand-kits/kit-typography.tsx` | Pairing anlegen, Detail, Bearbeiten, Duplikat und Herkunft | Englisch einschließlich der festen `new`-Detailausnahme |
| `components/upload-tray.tsx`, `url-import-form.tsx`, `_library/importe.tsx`, Referenz- und Sammlungsdetails | Fertige Uploads/Importe, bereits vorhandene Referenzen, ähnliche Referenzen und Sammlungsverknüpfungen | Englische Ziele; keine Änderung an importierten Quell-URLs |
| `_library/schriften.$slug.index.tsx`, `brand-kits/kit-details.tsx`, `kit-lifecycle.tsx` | Herkunft Referenz/Kit, kopiertes Kit, `?pairing=<slug>` | Nur Seitenpfade ändern, Kit-Pfade und `pairing` bleiben gleich |
| Referenz-/Sammlungsdetails, `_library/brand-kits.*`, `_library/generator.tsx`, `components/generator/generator-workspace.tsx` | Generator-Einstiege, Pool, Übernahme, Speichernavigation und Zustand in Browser-History | `/generator` und `/brand-kits/$slug` samt Query unverändert |
| `lib/sign-in.ts`, `start.ts`, `anmelden.tsx`, `server/auth.server.ts`, Owner-Menü | Anmeldepfad, Owner-Redirect, Erfolg-/Fehler-Callback und Abmelden | Zusammen auf `/sign-in` und den geprüften Rückweg umstellen |
| Einstellungen, `CreatedToken` und `CopyField` | Kopierter MCP-Endpunkt und `claude mcp add ... <origin>/api/mcp ...` | URL und CLI-/Header-Vertrag unverändert; nur erklärende UI-Texte übersetzen |
| MCP `generate_color_scheme`, `packages/mcp/src/color-scheme.ts` und `url.ts` | Absolutes `generatorUrl` aus `INSPO_BASE_URL` plus `/generator?...` | Bereits englisch, unverändert; kein Sprachpräfix oder Sprachparameter |
| MCP-Formatierung, `packages/mcp/src/format.ts`, `tools.ts`, `inline-images.ts`; Katalog in `packages/db/src/catalogue.ts` | `image`, `fullPage`, `thumb`, `mobile`, `mobileFull`, `imagePng`, `imageUrl`, eingebettete Bilder, gemessene Varianten | API-/Asset-URLs bleiben unverändert; `absolute` verwendet weiter `INSPO_BASE_URL` |
| MCP-Referenzen und verwandte Ergebnisse, `tools.ts`, `format.ts`, `packages/db/src/queries.ts` | `sourceUrl`, Quell- und Herkunftsdaten, Referenz-Slugs | Unveränderte Eigentümer-/Fremdinhalte. MCP gibt aktuell keine zusätzliche App-Detail-URL für Referenzen, Sammlungen oder Pairings aus; keine neue API erfinden |
| `server/library.server.ts`, `components/capture-figure.tsx` und Font-Previews | `originalUrl` und Bildressourcen über `/api/assets/<key>` | Unverändert, einschließlich Storage-Keys |
| `server/storage.server.ts`, Worker-API und `apps/worker/src/api.ts` | Uploadziele `/api/worker/objects/<key>?expires=...&signature=...` oder signierte S3-URLs, Job-Endpunkte | Unverändert; auch kein Redirect innerhalb absoluter Storage-URLs |
| `components/font-preview.tsx`, `pairing-poster.tsx`, `font-faces.tsx`, `lib/fonts.ts` und Font-Katalog | Gespeicherte `pageUrl`, Fontsource-CDN-URLs, Adobe-Stylesheet-URLs | Fremd-URLs und gespeicherte Font-Links unverändert |
| Referenzdetail, Markdown-Editor, `kit-design-briefing.tsx`, `packages/db/src/design-md.ts` | Fremde `sourceUrl`, frei eingegebene Markdown-Links, `data:text/markdown` für `DESIGN.md` und dessen Quellangaben | Inhalte und Downloads unverändert; keine automatische Textersetzung in Eigentümertexten |
| Root-Head, Auth-Konfiguration, README und Self-hosting-Doku | Icons, Stylesheets, GitHub-OAuth-Callback und dokumentierter MCP-Endpunkt | Keine sprachabhängigen URLs; technische Integrationspfade bleiben gleich |

Auch Browser-Lesezeichen und bereits versendete Links werden nicht umgeschrieben. Sie funktionieren über die Alias-Regeln. Neue Navigation und neue kopierte Seiten-URLs verwenden die englische Form; die App benötigt dafür keinen neuen Share-Button. Vorhandene deutsche App-Links innerhalb gespeicherter Notizen oder Briefings werden nicht verändert und bleiben durch Redirects nutzbar.

Die spätere Quellcode-Migration umfasst Route-Dateinamen und IDs, Navigation, Rücklinks, Linkgeneratoren, Auth-Helfer sowie passende Test-Erwartungen und technische Beispiel-Links. Den generierten Route-Tree regeneriert das vorhandene Werkzeug. Sie umfasst keine DB-Migration, kein Umbenennen von Slugs, keine Übersetzung von Suchwerten, API-Keys oder Bibliotheksinhalten und keine neue Produktansicht.

## Konkrete Links aus vorhandenen Verträgen

Die Werte sind synthetisch; die Linkformen stammen aus den oben genannten Quellen.

| Bestehender Link | Ergebnis nach Migration |
| --- | --- |
| Galerie `/?status=approved&favorites=true&device=mobile&tag=harbor&collection=sommer&q=Hotel%20am%20See` | Unverändert |
| Referenz `/referenzen/zimmeruebersicht?x=a%2Bb&x=a+b` | 308 auf `/references/zimmeruebersicht?x=a%2Bb&x=a+b` |
| Sammlung `/sammlungen/sommer/` | 308 auf `/collections/sommer` |
| Neues Pairing `/schriften/neu` | 308 auf `/type-pairings/new` |
| Pairing `/schriften/source-serif-inter/bearbeiten` | 308 auf `/type-pairings/source-serif-inter/edit` |
| Erlaubter bestehender Slug `/schriften/new` | 308 auf `/type-pairings/new/view` |
| Übernahme in ein Kit `/brand-kits/harbor?pairing=source-serif-inter&pool=project:harbor` | Unverändert |
| Referenz als Pool `/generator?pool=hotel-startseite` | Pfad unverändert; bestehender Generator ergänzt gegebenenfalls den `seed` |
| Sammlung als Pool `/generator?pool=collection:sommer` | Pfad und Pool unverändert |
| MCP `generatorUrl` `https://inspo.example/generator?brand=e56236~hue@harbor-app&neutral=8a7a72&extras=teal:2f7d6d~exact&seed=42&pool=project:harbor` | Vollständig unverändert |
| Kopierter MCP-Endpunkt `https://inspo.example/api/mcp` | Unverändert |
| Asset `https://inspo.example/api/assets/references/hotel/thumb.webp` | Unverändert |
| Anmeldung `/anmelden?next=%2Fschriften%2Fnew%3Fx%3D1&error=not_owner` | 308 auf `/sign-in` mit derselben Query; geprüfter Erfolgsrückweg `/type-pairings/new/view?x=1` |

## Fokussierte Abnahme der späteren Implementierung

Diese Fälle sind Anforderungen, keine Behauptung bereits laufender Redirects. Bestehende Tests gezielt erweitern: `owner-access.test.ts`, `generator-entry-points.test.ts`, `generator.test.ts`, `type-pairings.test.ts`, `packages/mcp/src/server.test.ts` sowie die vorhandenen API-Zugriffstests. Tabellen- und Sicherheitsfälle passen in einen kleinen Test der gemeinsamen reinen Zuordnung; nicht jede UI-Verknüpfung braucht einen Browser-Test.

1. Jede tatsächlich umbenannte Seitenzeile mit GET und HEAD prüfen, mit und ohne Schluss-Slash. 308 und internes englisches Ziel, bei HEAD leerer Body. Bereits englische kanonische Ziele, `/` und unveränderte Pfade haben keinen Migrationsredirect. EN-/DE-Cookies ergeben identische Ziele. Idempotenz und fehlende Zyklen über alle Tabellenzeilen nachweisen.
2. Unangemeldeter deutscher Detail-Link: 308 → englisches Ziel → 307 → `/sign-in?next=...` → GitHub → exakt das englische Detail einschließlich Query. Für `/` bleibt es bei `/sign-in` ohne `next`. Geschützte Seiten-HEADs bleiben geschützt. Kein Alias darf Eigentümerdaten ausgeben.
3. Alter direkter Anmelde-Link mit deutschem `next`, Fehlercode und innerer Query: äußere Query beim 308 unverändert; nach erfolgreichem Login englisches Ziel. Ein wiederholbarer OAuth-Fehler und der globale Auth-Fehlerpfad behalten den sicheren Rückweg für einen erneuten Versuch. Sprachwechsel verwirft ihn ebenfalls nicht.
4. Exakte Query-Erhaltung etwa bei `/sammlungen/sommer?x=a%2Bb&x=a+b&empty=&q=%252F&unknown=1`. Die Umleitung verändert weder Reihenfolge noch Mehrfachwerte oder Kodierung. Ein `#section` bleibt im Browser erhalten. `next` erhält innere Query und Hash, ohne sie außen zu duplizieren.
5. Alle unsicheren `next`-Werte führen zu `/`: absolute URL, `//evil.example`, `/\\evil.example`, `javascript:...`, Steuerzeichen, kodierte Separatoren im Pfad, fehlerhafte Prozentkodierung, Punktsegmente, Sign-in-Ziele, unbekannte Seiten, `/api/auth/sign-out`, Asset- und Server-Function-Ziele sowie mehrere äußere `next`-Werte. Ein direkter fremder Better-Auth-`callbackURL` bleibt abgewiesen.
6. Slugs `new`, `edit`, `view`, `bearbeiten`, `neu-123abc` und ein deutscher Slug bleiben unverändert. Bestehendes Pairing `new`: altes Detail → `/type-pairings/new/view`, alter Editor → `/type-pairings/new/edit`; das Anlegeformular liegt getrennt auf `/type-pairings/new`. Neue Namen `new` und `neu` bekommen nach bestehender Regel einen Suffix. Linkgeneratoren, Duplikat-Link und Herkunftslink müssen diese Ausnahme ebenfalls treffen.
7. `/referenzen/zimmer%75ebersicht` trifft denselben Slug; kodiertes `new` trifft die feste Ausnahme. `%2F`, `%5C`, `%252F`, ungültige `%`-Folgen und zusätzliche Segmente dürfen keine falschen Aliase, Hostwechsel oder anderen Objekte erzeugen. Ein Separator im Query-Wert bleibt dagegen erhalten.
8. POST auf einen alten Seitenpfad und direkte GET-/POST-Server-Functions erhalten keinen 308 der Seitenmigration. API-/MCP-/Worker-/Asset-Zugriffstests bleiben gültig, einschließlich ihrer bisherigen Pfadvarianten und Authentifizierung. Signierte Upload-URLs bleiben bytegleich.
9. MCP `generatorUrl`, Galerie-Filter, Generator-Tokens einschließlich `12e456`, Brand-Kit-`pairing` und Pool-Einstiege bleiben fachlich gleich. Ein unbekannter Slug erreicht nach dem 308 die vorhandene 404-Ansicht mit englischem Rücklink; unbekannte Seiten werden nicht erraten.
10. Nach der Quellcode-Migration ein gezielter Suchlauf nach den alten Seitenpfaden: Treffer sind nur in der bewusst erhaltenen Alias-Tabelle, deren Tests oder historischen Erläuterungen erlaubt. Neue App-/Auth-Links dürfen nicht erst einen Alias benötigen. Eigentümerinhalte und Fremd-URLs sind von diesem Quellcode-Check ausgenommen.

## Nachweis und Übergabe

Die Bestandsaufnahme beruht auf allen Route-Dateien, deren `createFileRoute`-IDs, `router.tsx`, `start.ts`, Auth-Helfern, den oben genannten Komponenten und URL-Erzeugern sowie den vorhandenen Tests. Insbesondere belegen die Quellen die Query-Verträge, den derzeitigen GET-307, die reservierte Form `neu`, die erlaubte Kollision `new` und die bereits englischen MCP-Generator-URLs.

Direkte Einstiegspunkte in die geprüften Quellen:

- [Route-Dateien](../../../apps/web/src/routes), [Owner-Gate](../../../apps/web/src/start.ts), [Anmelde-Helfer](../../../apps/web/src/lib/sign-in.ts), [Auth-Konfiguration](../../../apps/web/src/server/auth.server.ts) und [bestehende Auth-Tests](../../../apps/web/src/owner-access.test.ts).
- [Pairing-Slugs und Reservierung](../../../apps/web/src/server/type-pairings.server.ts), [Slug-Erzeugung](../../../apps/web/src/server/slug.ts) und [Pairing-Tests](../../../apps/web/src/type-pairings.test.ts).
- [Galerie-Query](../../../apps/web/src/routes/_library/index.tsx), [Router-Search-Parser](../../../apps/web/src/lib/search.ts), [gemeinsamer Generator-URL-Vertrag](../../../packages/shared/src/color-scheme/url.ts) und [Generator-Einstiegstests](../../../apps/web/src/generator-entry-points.test.ts).
- [MCP-Generator-Link](../../../packages/mcp/src/color-scheme.ts), [absolute MCP-URLs](../../../packages/mcp/src/url.ts), [MCP-Ausgabe](../../../packages/mcp/src/format.ts), [MCP-Tools](../../../packages/mcp/src/tools.ts), [Katalog-Assets](../../../packages/db/src/catalogue.ts) und [Storage-Uploadziele](../../../apps/web/src/server/storage.server.ts).

Für dieses Dokument genügen Dateiinventar-, Quellen-, Link- und Whitespace-Prüfungen. Es verändert keinen ausführbaren Code; Typecheck, Build und Vollsuite gehören nicht zu diesem Planungsschritt. Der Koordinator verantwortet Review und gemeinsame CI des Dokumentations-PRs. Die spätere Produktmigration benötigt die oben beschriebenen fokussierten Nachweise und die gemeinsame Implementierungsprüfung. Der Node-24-Nachweis der Paraglide-Laufzeit bleibt dort erforderlich; er ist keine Voraussetzung für diese Routenentscheidung.
