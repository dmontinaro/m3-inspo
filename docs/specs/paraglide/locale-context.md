# Sprachkontext für Validierung, Jobs und KI-Texte

Entscheidung zu [Sprachkontext für Validierung, Jobs und KI-Texte festlegen](https://github.com/dmontinaro/m3-inspo/issues/5), Teil der [Paraglide-Planung](https://github.com/dmontinaro/m3-inspo/issues/2). Grundlage ist der Code auf `3151aa30dc20c4f2d73e35974c52915bc02650b0`.

Die Produktvorgaben stammen aus der Map. Die unten ergänzten Detailregeln sind im beauftragten Autopilot-Lauf gewählte Agent-Defaults. Sie sind keine Behauptung einer persönlichen Erprobung oder Einzelabnahme durch den Eigentümer. Dieses Dokument plant die spätere Umsetzung; es ändert kein Produktverhalten.

## Vorhandenes Verhalten und technische Grundlage

| Stelle | Befund und Konsequenz |
| --- | --- |
| [Validierung der Referenzen](../../../apps/web/src/server/library.server.ts), [URL-Import](../../../apps/web/src/server/import-jobs.server.ts), [Upload-Limits](../../../apps/web/src/lib/upload-limits.ts) | Schemas, Fehlermeldungen und ein deutscher Zahlenformatierer entstehen auf Modulebene. Übersetzte Texte dürfen dort künftig nicht beim Import eingefroren werden. |
| [Server Functions](../../../apps/web/src/server/brand-kits.functions.ts) | Zod prüft teilweise bereits vor dem Handler. Nur den Handler zu lokalisieren würde diese Fehler übersehen. |
| [Analysemodell](../../../apps/web/src/server/analysis-model.server.ts), [Analyselauf](../../../apps/web/src/server/analysis.server.ts) | Ein Modellaufruf erzeugt `description` und `layoutSummary` jeweils mit `de` und `en`. Beide sind im Antwortschema erforderlich und werden gemeinsam als neue Version gespeichert. Es gibt keine Generierung pro gewählter Anzeigesprache. |
| [Analyseansicht](../../../apps/web/src/components/ai-analysis.tsx) | Die Inhaltsauswahl ist heute lokaler React-State mit festem Startwert `de`. Der separate DE/EN-Schalter bleibt; nur seine Initialisierung ändert sich. |
| [Briefingerzeugung](../../../apps/web/src/server/kit-briefing.server.ts) | Der direkte Server-Aufruf erzeugt derzeit deutsches Markdown und liest die deutsche Analysefassung. Es ist kein Hintergrundjob. |
| [Briefingeditor](../../../apps/web/src/components/brand-kits/kit-design-briefing.tsx), [Speicherung](../../../apps/web/src/server/brand-kits.server.ts) | KI-Entwurf und eingefügte Vorlage ändern nur den Editor. Erst `updateBrandKitDesignBriefing` nach Betätigung von „Briefing speichern“ persistiert den Text. Der Download enthält den gespeicherten Stand. |
| [Jobschema](../../../packages/db/src/library-schema.ts), [Capture-Worker](../../../apps/worker/src/process-job.ts), [Job Runner](../../../apps/web/src/server/job-runner.server.ts) | Jobs enthalten fachliche Eingaben, keine Sprache. `errorMessage` ist ein bereinigter String ohne strukturierten Fehlercode. Capture-Worker und Analyse-/Embedding-Runner arbeiten außerhalb eines Browser-Requests. |

Der [Runtime-Spike](https://github.com/dmontinaro/m3-inspo/blob/e5304d1084789d93d0c07f15e01e32444c26db61/docs/research/paraglide-runtime-spike.md) belegt Paraglide 2.29.3 mit dem gesamten Start-Handler im `paraglideMiddleware`-Wrapper. Der geprüfte Source-Commit ist `877fde459b6f8f29ee3c02f3151eb203684df3cc`. 24 parallele direkte Server-Function-Aufrufe behalten ihre Sprache über `await`. Die dortige Validierungsprobe erzeugt ihr Schema im Request; sie beweist noch keine sichere Migration der bestehenden Modulebene-Schemas.

Die Spec übernimmt die Pluginreihenfolge vor Start/React, die Weitergabe der Handler-Optionen, `cookie`/`baseLocale`, Generierung vor dem Typecheck, Typdeklarationen und die Aufnahme der Paraglide-Konfiguration in `tsconfig.include`. Der Spike lief unter Node 26. Der Node-24-CI-Nachweis bleibt Voraussetzung der späteren Produktübernahme, kein offener Produktentscheid dieses Dokuments.

## Kleiner Sprachvertrag

Die Web-App hält genau diese Zuständigkeiten auseinander:

```ts
// UiLocale follows the generated Paraglide locales, including future catalogs.
type UiLocale = (typeof locales)[number];
type ContentLanguage = "en" | "de";

// Adding a UI locale does not extend the supported content languages.
function contentLanguageForUi(locale: string): ContentLanguage {
  return locale === "de" ? "de" : "en";
}

type BriefingGeneration = {
  slug: string;
  outputLanguage: ContentLanguage;
};

type BriefingWriter = (
  prompt: string,
  outputLanguage: ContentLanguage,
) => Promise<string>;
```

`locales` stammt aus dem generierten Paraglide-Runtime-Modul. `ContentLanguage` wird nicht aus `UiLocale` abgeleitet und nicht durch einen Cast erweitert. Es beschreibt die tatsächlich unterstützten Inhaltsfassungen. Kein allgemeines `LocaleContext`-Objekt und kein eigener globaler Locale-Store sind nötig.

| Entscheidung | Quelle und Lebensdauer |
| --- | --- |
| UI-Sprache | Paraglide `getLocale()` im aktiven Request beziehungsweise Browser. Fehlender oder ungültiger `PARAGLIDE_LOCALE`-Cookie ergibt `en`. `Accept-Language` beeinflusst die Auswahl nicht. |
| Analyse-Anzeigesprache | Beim Öffnen einer Referenz `contentLanguageForUi(uiLocale)`, danach eigener DE/EN-State dieser Ansicht. Polling, Router-Invalidierung und eine neue Analyseversion erhalten die manuelle Auswahl. Beim Öffnen einer anderen Referenz oder nach einem vollständigen Reload beginnt die Auswahl wieder aus der UI-Sprache. Keine zusätzliche Cookie- oder Datenbankpräferenz. |
| Analyse-Ausgabe | Immer beide Sprachen in einem Lauf, unabhängig von UI und Anzeigeschalter. |
| Neue Briefing-Ausgabe | `contentLanguageForUi(uiLocale)` einmal beim Start des Server-Function-Handlers erfassen und als `outputLanguage` explizit an den Briefingdienst weitergeben. Diese Ausgabeentscheidung gilt bis zum Ende dieses Aufrufs. |

Ein DE/EN-Klick verändert weder UI-Cookie noch Analysejob oder Briefing-Ausgabe. Bedienelemente, Status, Fehler, das Datum und die Überschrift „Aufbau“/„Layout“ folgen weiterhin der UI-Sprache; nur die generierten Absätze folgen der Inhaltsauswahl und tragen deren `lang`-Attribut.

Eine spätere UI-Sprache wie `fr` startet Analyseanzeige und neue Briefings auf Englisch. Die UI erklärt diesen Inhalts-Fallback in ihrer Sprache. Zusätzliche Inhaltssprachen brauchen eine eigene Produktentscheidung und eine Erweiterung des Inhaltsvertrags. Ein Manipulationsversuch mit `fr` ist heute kein gültiger UI-Cookie und ergibt bereits UI-Englisch. Wird an einer ausdrücklich DE/EN-typisierten Eingabe künftig ein anderer Wert empfangen, wird er als `invalid_value` abgelehnt, bevor ein Modellaufruf oder Schreibzugriff beginnt. Das ist kein stiller Fallback für explizite Inhaltswünsche.

## Request-Grenze und Validierung

Der Server-Entry legt `paraglideMiddleware(request, () => handler.fetch(request, options))` um den gesamten Start-Handler. Damit liegen SSR, Loader, Server-Function-Validator und Handler im selben Request-Kontext. Die vorhandenen Owner-, CSRF-, Body-Limit-, MCP- und Worker-Schutzprüfungen bleiben aktiv. Ein direkter Server-Function-Aufruf benötigt keine vorherige Navigation; sein eigener Cookie entscheidet.

Übersetzungen entstehen bei ihrer Verwendung. Kein `m.some_message()` und kein `getLocale()` läuft zur Initialisierung von Modulkonstanten, Zod-Schemas, Fehlerlisten oder Formatierern. Kein `z.config()`/globaler Zod-Error-Map und kein prozessweites `setLocale()` darf die Sprache einer Server-Anfrage festlegen. Überlappende Requests teilen keinen requestabhängigen Textcache und keine veränderlichen Locale-Daten.

Die vorhandenen Schemas dürfen auf Modulebene bleiben. Ihre Prüfungen enthalten neutrale Regeln und bei eigenen `refine`-Prüfungen stabile Fehlerkennungen. Standard-Zod-Issues liefern beispielsweise `code`, `path`, `minimum` oder `maximum`; diese werden nach `safeParse` in einen kleinen lokalen Fehlervertrag überführt. Menschliche `issue.message`-Texte dienen nicht als Schlüssel. Eigene Kennungen werden ausdrücklich zugeordnet, unbekannte Fälle ergeben `invalid_input`.

Beispiel für Referenzfelder, kein vorgeschriebener universeller Fehlerbaukasten:

```ts
type ReferenceField = keyof z.input<typeof referenceFields>;
type ValidationProblem =
  | { field: ReferenceField; code: "required" | "invalid_value" }
  | { field: ReferenceField; code: "too_long"; params: { max: number } }
  | { code: "invalid_input" };
```

`required` am Titel entspricht der bestehenden Mindestlänge 1, `too_long` trägt das tatsächliche Limit als Zahl. Eigene Regeln etwa für URL-Schema, Taganzahl und Dateiformat behalten ihre konkreten Kennungen und typisierten Parameter im jeweiligen Modul. Kein Datenwert und kein eingegebener Text wird unkontrolliert in eine Fehlermeldung kopiert. Das Katalogticket legt die zugehörigen englischen Message-IDs und vollständigen Übersetzungen fest.

| Grenze | Übergabe und Übersetzung |
| --- | --- |
| Browser-Validierung | Gleiche Grenzwerte und neutrale Fehlerkennungen; erst beim Anzeigen mit der aktiven UI-Sprache formatieren. Browserprüfung ersetzt die Serverprüfung nicht. |
| Fachfunktion → Web-Server-Function | Code und typisierte Parameter. Die Web-Grenze übersetzt im Request-Kontext und behält bestehende Antwortformen wie `{ ok: false, reason: string }` oder Feldfehler mit `string[]`. Die Lokalisierung erfordert keinen Umbau dieser öffentlichen Formen. |
| `.validator(...)` vor dem Handler | Erwartbare Formfehler als reguläres Feldergebnis behandeln. Die übrigen Validatoren verwenden einen gemeinsamen Web-seitigen Parse-Adapter direkt in `.validator(...)`: `safeParse`, bei Erfolg die geprüften Daten zurückgeben, bei Fehlern neutrale Issues zuordnen und einen `Error` mit sicherer lokalisierter Meldung werfen. Die Fehleransicht zeigt einen lokalisierten allgemeinen Ersatztext, falls der Transport Details ausblendet. Ein Handler-`catch` allein reicht nicht. Weder rohe Zod-Meldungen noch interne Kennungen erscheinen in der UI. |
| Bekannte Ergebniskennungen | Werte wie `disabled`, `failed`, `duplicate`, Jobstatus und Phasen bleiben unverändert. Die UI übersetzt sie; ihre Zeichenketten werden keine deutschen oder englischen Fachwerte. |
| Unerwartete Ausnahme | Lokalisierte allgemeine Fehlermeldung in der Web-Fehleransicht. Technische Details gehören in die vorhandenen bereinigten Diagnosewege, nicht als ungeprüftes `error.message` in ein Formular. |
| Worker-API und MCP | Bestehende Maschinenverträge, Namen, Statuscodes und Antwortformen bleiben stabil und unabhängig vom UI-Cookie. Technische Fehlertexte werden nicht mit Paraglide im Browserkontext erzeugt. Die Web-UI ordnet bekannte Codes ihrer eigenen Meldung zu. |

Die Message-Zuordnung gehört in die Web-App. `@m3-inspo/taxonomy`, DB-, Shared- und Worker-Pakete importieren keine generierten Web-Messages. Taxonomie-Werte und Modell-Enums bleiben unverändert; übersetzte Labels sind Web-Darstellung.

Für Zahlen und Datum wird die UI-Locale bei der Formatierung verwendet, etwa `en` → `en-GB`, `de` → `de-DE`. Alle Datumsformatierer setzen `timeZone: "Europe/Berlin"`. Formatierer dürfen nach expliziter Locale gecacht sein, aber keinen veränderlichen globalen Standard besitzen. Größenlimits bleiben numerische Parameter; das bisherige `germanNumber` und eingefrorene Upload-Meldungen werden durch Formatierung bei Verwendung ersetzt.

## Hintergrundjobs und gespeicherte Fehler

Ein Job konsumiert nur seine persistierten Eingaben und die Referenzdaten. Er liest keinen Browser-Cookie und benötigt keinen Paraglide-Request-Kontext. Das gilt auch dann, wenn etwa eine Import-Completion über einen HTTP-Handler einen Analysejob einreiht. Die Locale des Worker-Requests wird nicht zur Ausgabesprache.

- `url_capture` und `font_preview` erfassen Quellen ohne neue Sprachwahl. Seitentitel und andere gelesene Inhalte bleiben Quelldaten.
- `analysis` erzeugt weiterhin die beiden erforderlichen Sprachfassungen. `AnalysisInput.trigger` genügt; ein Feld `locale` oder `outputLanguage` wäre irreführend.
- `embedding` verarbeitet die bestehenden Inhalte mit seinem bestehenden Vertrag. Der UI-Sprachwechsel löst weder einen neuen Job noch eine Neuübersetzung aus.
- Status-, Phasen- und Wiederholungsanzeigen übersetzt die betrachtende UI aus den stabilen Werten, unabhängig von der Sprache beim Einreihen oder Ausführen.

Für Fehler bleibt `import_jobs.error_message` der bestehende technische Detailtext. Es gibt für diese Einführung weder eine neue Fehlercode-Spalte noch eine Umschreibung alter Datensätze. Neue anwendungseigene Diagnosen im Runner werden als feste technische Texte erzeugt, ohne Zugriff auf Web-Messages; vorhandene Fehlerbereinigung und Geheimnisfilter bleiben erhalten. Externe Detailtexte werden nicht übersetzt.

Die Importliste, Analyseansicht und Schriftvorschau zeigen bei `failed` einen lokalisierten Hinweis mit einer sinnvollen nächsten Aktion. Vorhandene Details folgen separat mit einer lokalisierten Beschriftung wie „Technische Details im Original“. Ein historischer deutscher Detailtext darf daher in einer englischen UI stehen. Fehlende Details ergeben eine lokalisierte allgemeine Erklärung. Keine Sprache wird aus dem Text erraten, kein historischer Satz auf einen Fehlercode zurückgeparst. Auch vorhandene Bereinigungsmarker bleiben erhalten.

Diese Entscheidung liefert bewusst keine übersetzte Einzeldiagnose für jeden gespeicherten Fehler. Dafür wären künftig strukturierte persistierte Codes/Parameter und gegebenenfalls eine kompatible Erweiterung der Worker-API nötig. Für die vereinbarte lokalisierte Erklärung mit Originaldetails sind sie nicht erforderlich.

## Neue Briefings und unveränderte Eigentümertexte

`draftBrandKitDesignBriefing` erhält weiterhin `{ slug }`. Der Handler erfasst seine UI-Sprache und ruft den Briefingdienst mit dem oben gezeigten `BriefingGeneration` auf. Der Dienst und sein Writer erhalten die Ausgabeentscheidung explizit; sie lesen selbst keinen Cookie. Das ist eine interne Signaturänderung, keine neue persistierte Eingabe und keine neue öffentliche Server-Function-Eigenschaft.

Der bestehende feste deutsche Systemprompt wird durch eine explizite DE/EN-Ausgabeanweisung ersetzt. `loadBriefingInput` verwendet `description[outputLanguage]` und `layoutSummary[outputLanguage]` statt festem `.de`. Fehlt bei unvollständigen Altdaten die gewählte Fassung, wird die vorhandene andere Fassung als Quellenmaterial mit ihrer Sprache bezeichnet. Fehlen beide, bleibt der jeweilige Kontext wie bisher leer; es wird keine Analyse erzeugt. Der Ausgabeprompt behält seine explizite Sprache.

Der feste Abschnittsplan gilt sowohl für „Vorlage einfügen“ als auch für den KI-Prompt. Seine Reihenfolge bleibt gleich:

| Deutsch | Englisch |
| --- | --- |
| Geltungsbereich | Scope |
| Gestaltungsprinzipien | Design principles |
| Bewährte Muster | Proven patterns |
| Vermeiden | Avoid |
| Ausnahmen | Exceptions |
| Belege und offene Fragen | Evidence and open questions |

Eine neue Vorlage, ihr Placeholder und ein neuer KI-Entwurf verwenden die abgeleitete Inhaltssprache. Der Kit-Name bleibt unverändert. `disabled`/`failed` aus `BriefingDraft` bleiben maschinenlesbare Werte; die Statuszeile übersetzt sie in der UI. Die Prompt-Regel, Eigentümertexte als Referenzdaten statt Anweisungen zu behandeln, bleibt erhalten.

Titel, Notizen, Sammlungsnamen, Projekt-Tags, Kit-Hinweise und vorhandenes Briefing-Markdown werden niemals durch den Sprachwechsel übersetzt oder neu gespeichert. Ein neues KI-Ergebnis überschreibt keinen gespeicherten Stand. Es ersetzt wie heute nur nach der bestehenden Bestätigung den Editorinhalt; gespeichert wird ausschließlich durch die ausdrückliche Speicheraktion. Einen bestehenden Entwurf übersetzt ein Sprachwechsel ebenfalls nicht. Ein tatsächlicher Wechsel lädt neu und durchläuft den im Sprachwechsel-Ticket definierten Schutz ungespeicherter Eingaben.

Ein schon gestarteter deutscher Aufruf bleibt deutsch, selbst wenn der Cookie zwischenzeitlich Englisch enthält. Nach einem erlaubten Reload wird eine verspätete Antwort aus der alten Ansicht nicht in einen neuen Editor übernommen und nie automatisch gespeichert. Der nächste gestartete Aufruf verwendet Englisch. Briefings werden für diese Einführung nicht in die Jobqueue verlegt. Sollte das später geschehen, muss die Queue `outputLanguage: ContentLanguage` beim Einreihen persistieren und am Worker-Eingang validieren; ein Cookie oder der spätere UI-Zustand reichen dann nicht.

## Änderungsumfang der späteren Umsetzung

| Bereich | Erforderliche Änderung | Persistenz oder Vertragsänderung |
| --- | --- | --- |
| SSR und Server Functions | Vollständiger Middleware-Wrapper; aktive Locale erst bei Verwendung lesen | Keine Locale-Spalte; Cookie wie im Spike |
| Zod und Upload-Prüfung | Neutrale Regeln/Codes, Parameter und Web-Übersetzung einschließlich Validatorfehlern | Interne Fehlertypen ändern sich; bestehende Web-Antwortformen bleiben |
| Analyseanzeige | Startwert aus UI, eigener DE/EN-State, UI-Beschriftungen trennen | Keine Speicherung der Auswahl |
| Analyse- und andere Jobeingaben | Keine Sprachwahl ergänzen | Kein JSONB-Input- oder SQL-Schema-Umbau |
| Jobfehler | Lokalisierter Hinweis, Originaldetails, Runner ohne Web-Messages | Bestehendes `errorMessage`; keine Datenmigration |
| Briefingerzeugung | Explizite interne `outputLanguage`, Prompt und Analysequellen passend auswählen | Interne Dienst-/Writer-Signatur ändern; `{ slug }` bleibt |
| Briefingspeicherung und Download | Vorhandene ausdrückliche Speicheraktion beibehalten | `designBriefing` bleibt ein einzelner Text; keine Sprachmetadaten oder Übersetzungsmigration |
| Taxonomie, MCP, API, Konfiguration | Web-Labels übersetzen, stabile Werte erhalten | Keine Umbenennung von Keys, Tools oder `INSPO_*` |

## Abnahmefälle für die Produktmigration

Diese Fälle sind verbindliche Erwartungen für spätere gezielte Tests, keine hier ausgeführten Produktnachweise. Bestehende Tests für [Analysen](../../../apps/web/src/analysis.test.ts), [Importjobs](../../../apps/web/src/import-jobs.test.ts) und [Briefings](../../../apps/web/src/kit-briefing.test.ts) werden an ihren vorhandenen Grenzen ergänzt.

| Fall | Erwartetes Ergebnis |
| --- | --- |
| Erstbesuch, fehlender Cookie, Cookie `xx` und jeweils deutsches `Accept-Language` | UI und serverseitiger Formularfehler auf Englisch, `html lang="en"`. Gültiges `de` liefert Deutsch. |
| Gleichzeitige EN/DE-Server-Function-Aufrufe mit zu langem Titel nach gemeinsamem Modulimport, jeweils mit `await` | Gleicher Fehlercode und Grenzwert, passende Meldung pro Request. Kein erster Request friert die Sprache des Schemas ein. Auch ein Fehler direkt aus `.validator` bleibt lokalisiert. |
| Browserprüfung und direkte Serverprüfung desselben ungültigen Feldes | Gleicher Grenzwert und dieselbe Bedeutung; rohe Zod-Texte und technische Codes erscheinen in keiner UI. |
| Import unter Deutsch eingereiht; Browser vor Jobstart auf Englisch gewechselt | Erfassung unverändert; Status, Datum und Fehlerhinweis beim nächsten Betrachten englisch. Originaldetails unverändert, kein gespeicherter UI-Sprachwert nötig. |
| Analyse unter Deutsch eingereiht, später ohne Browser-Request ausgeführt | Ein Modellaufruf speichert weiterhin beide Fassungen in einer Version. Englische UI startet mit Englisch; manuelles DE bleibt über Polling und neue Version erhalten. |
| Analyseinhalt auf DE umgeschaltet, UI bleibt Englisch | Nur die generierten Absätze sind deutsch. Beschriftungen, Fehler und Berlin-Datum bleiben englisch. Neuer Briefing-Aufruf erzeugt Englisch. |
| Historischer deutscher Fehler in englischer Import-/Analyse-/Schriftansicht; daneben ein Fehler ohne Details | Lokalisierte Erklärung und Detailbeschriftung, Originaltext unverändert; ohne Details allgemeiner lokalisierter Hinweis. Kein DB-Write durch Anzeigen. |
| Neue UI-Sprache `fr` bei weiterhin DE/EN-Inhaltsdaten | UI bleibt Französisch, Analyse und neue Briefings verwenden Englisch mit erklärtem Fallback. Kein Indexzugriff auf eine nicht vorhandene Analysefassung `fr`. |
| Ungültige explizite Inhaltssprache an einer DE/EN-Eingabe | Validierungsfehler vor Modellaufruf oder Speicherung. Die heutige Briefing-Server-Function bietet kein solches Sprachfeld an. |
| Frische KI-Entwürfe auf EN und DE, ebenso eingefügte Vorlagen | Passende Sprache und Abschnittsüberschriften; Kit-Name und Eigentümerquellen unverändert. Vor Speichern keine Datenbankänderung. |
| Deutscher Briefing-Aufruf läuft; Cookie ändert sich; danach neuer englischer Aufruf | Erster Prompt und Quellenwahl bleiben deutsch, zweiter englisch. Ein Reload übernimmt keine verspätete Antwort des alten Editors. |
| Gespeichertes deutsches Briefing, anschließend englische UI | Editor und Download enthalten dasselbe gespeicherte Markdown. Kein automatischer Entwurf, keine Übersetzung, kein Speichern. |
| Ungespeicherter Entwurf vor tatsächlichem UI-Sprachwechsel | Der Schutz ungespeicherter Eingaben greift. Abbrechen erhält Sprache und Text; bestätigtes Verlassen darf den flüchtigen Text verwerfen, niemals den gespeicherten Stand ändern. |

Es bleiben für diesen Vertrag keine offenen Produktfragen. Die gemeinsame Spec führt ihn mit Routen, Sprachwechsel sowie Katalog- und Abnahmeregeln zusammen.
