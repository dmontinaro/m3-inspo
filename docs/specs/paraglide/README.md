# Paraglide für die gesamte Web-App

Umsetzungsreife Spec zur Map [Mehrsprachigkeit mit Paraglide und englischen Routen planen](https://github.com/dmontinaro/m3-inspo/issues/2) und zur Entscheidung [Übersetzungskataloge, Abnahme und Spec-Übergabe festlegen](https://github.com/dmontinaro/m3-inspo/issues/7).

Verbindliche Detailverträge:

- [Englische Routen, Legacy-Redirects und sichere Anmelderückwege](routes.md)
- [Sprachkontext, Validierung, Jobs und KI-Inhalte](locale-context.md)
- [Kataloge, vollständige Ansichtenmatrix und Abnahme](catalogs-and-acceptance.md)
- [Sprachwechsel: fester Prototyp-Befund](https://github.com/dmontinaro/m3-inspo/blob/1724efa4be29998b8643c102c2398796f5b406b0/docs/prototypes/paraglide-language-switch.md)

Diese Spec und ihre Begleitdokumente liefern ausschließlich Dokumentation. Sie führen weder Paraglide noch englische Routen im Produkt ein. Alle nachfolgenden Verhaltens- und Abnahmekriterien gelten für die spätere Migration. Der HTML-Prototyp und der technische Spike bleiben auf ihren verwerfbaren Branches.

Bestandsbasis ist `3151aa30dc20c4f2d73e35974c52915bc02650b0`. Die Produktvorgaben stammen aus der Map und dem bestätigten Planungsauftrag. Ergänzende Entscheidungen sind Agent-Defaults im delegierten Autopilot, keine einzeln vom Eigentümer bestätigten Wünsche oder persönliche UX-Abnahme. Die Begriffe folgen [CONTEXT.md](../../../CONTEXT.md).

## Problem statement

Der Eigentümer kann die Designbibliothek derzeit nur mit einer überwiegend deutschen Oberfläche bedienen. Englische Fachlabels, deutsche Fehlermeldungen und fest auf Deutsch formatierte Zahlen stehen nebeneinander. Coding-Agenten können eine neue UI-Sprache nicht an einer klaren Grenze ergänzen, ohne sich durch sämtliche Ansichten, Validatoren und Hintergrundabläufe zu arbeiten.

Die Einführung muss bestehende Links und gespeicherte Inhalte erhalten. Ein bloßer Texttausch würde frühe Formularfehler, Dialoge, Statusanzeigen und barrierefreie Beschriftungen übersehen. Ein Reload beim Sprachwechsel könnte lokale Dateien, Hinweise, Briefing-Entwürfe oder einen nur einmal sichtbaren MCP-Token verlieren.

## Solution

Die gesamte bestehende Web-App erhält Englisch als Standard und Deutsch als manuell wählbare zweite UI-Sprache. Die Wahl gilt pro Browser. Beide Sprachen nutzen dieselben englischen Seitenpfade ohne Sprachpräfix. Alte deutsche Links leiten dauerhaft weiter.

Oberfläche, verständliche Fehler, Zahlen und Datum folgen der UI-Sprache. Titel, Notizen, Namen, Projekt-Tags und gespeicherte Briefings bleiben Eigentümer-Inhalte. Die KI-Analyse behält ihre unabhängige DE/EN-Inhaltsauswahl. Neue Briefing-Entwürfe verwenden die aktuelle UI-Sprache. Ein gemeinsamer Schutz verhindert unbeabsichtigten Datenverlust beim Wechsel.

## User stories

1. Als Eigentümer möchte ich beim ersten Besuch Englisch sehen, damit die Bibliothek ohne vorherige Spracheinstellung auf Englisch nutzbar ist.
2. Als Eigentümer möchte ich auf Anmeldung und Einstellungen Deutsch wählen und die Wahl in diesem Browser behalten, damit ich die Oberfläche selbst bestimmen kann.
3. Als Eigentümer möchte ich die Sprache direkt im Eigentümer-Menü und in offenen modalen Editoren erreichen, damit ich dafür keine bearbeitete Seite verlassen muss.
4. Als Eigentümer möchte ich beim Wechsel dieselbe URL mit Suchparametern und Fragment behalten, damit Galerie-Filter, Generatorfarben und mein Anmelderückweg erhalten bleiben.
5. Als Eigentümer möchte ich vor dem Verlust lokaler Eingaben einmal gemeinsam gewarnt werden und sicher abbrechen können, damit ich meine Arbeit behalten kann.
6. Als Eigentümer möchte ich nach dem Zurücksetzen aller Werte auf den Ausgangsstand ohne Warnung wechseln, damit die Warnung nur bei tatsächlich verlierbarer Arbeit erscheint.
7. Als Eigentümer möchte ich während Speichern, Browser-Uploads, KI-Briefingerzeugung und OAuth-Start einen verständlichen Wechsel-Blocker sehen, damit keine ausstehende Antwort verloren geht.
8. Als Eigentümer möchte ich bei einem nur einmal sichtbaren neuen MCP-Token bis zu "Fertig" vor einem Sprachwechsel geschützt sein, damit ich ihn zuerst kopieren kann.
9. Als Eigentümer möchte ich angenommene Importe und Analysejobs nach dem Wechsel weiterlaufen sehen, damit ich sie weder neu starten noch erneut bezahlen muss.
10. Als Eigentümer möchte ich alte Links zu Referenzen, Sammlungen und Schriften weiterverwenden, damit gespeicherte Verweise ihr Ziel behalten.
11. Als Eigentümer möchte ich nach GitHub-Anmeldung oder einem wiederholbaren Anmeldefehler zu meinem sicheren ursprünglichen Ziel gelangen, damit ein alter deutscher Link ebenfalls funktioniert.
12. Als Eigentümer möchte ich in der Galerie Suche, Status, Format, Favoriten, Sammlung und Tags mit passenden Labels und Leerzuständen bedienen, damit ich Referenzen in beiden Sprachen finde.
13. Als Eigentümer möchte ich Einzelbilder und mehrere Dateien über Hinzufügen, Einfügen oder Ziehen mit verständlichen Limits und Ergebnissen erfassen, damit ich abgelehnte Dateien gezielt korrigieren kann.
14. Als Eigentümer möchte ich URL-Importe mit lokalisierten Feldfehlern und verständlicher Dublettenbehandlung anlegen, damit fehlerhafte Eingaben vor dem Einreihen erkennbar sind.
15. Als Eigentümer möchte ich Importarten, Phasen, Versuche und Fehlerhinweise in meiner UI-Sprache lesen, damit ich zwischen Warten, Wiederholen und Öffnen der Referenz unterscheiden kann.
16. Als Eigentümer möchte ich Titel, Fokus, Format, Notizen, Tags, Quelle und Urheberhinweis einer Referenz in beiden UI-Sprachen bearbeiten, damit meine Inhalte unverändert gepflegt werden können.
17. Als Eigentümer möchte ich Bereiche auf Aufnahmen markieren, ihren Komponententyp wählen und Notizen speichern, damit ich konkrete Teile einer Referenz wiederfinde.
18. Als Eigentümer möchte ich Herkunft, Designwerte und Taxonomie-Labels verständlich lesen, damit ich gemessene Werte von KI-Schätzungen und eigenen Angaben unterscheiden kann.
19. Als Eigentümer möchte ich KI-Texte zunächst in der UI-Sprache sehen und unabhängig DE/EN wählen, damit ich die vorhandenen Inhaltsfassungen vergleichen kann, ohne die ganze Oberfläche umzustellen.
20. Als Eigentümer möchte ich Sammlungen anlegen, bearbeiten, sortieren und Referenzen hinzufügen oder entfernen, damit diese Abläufe samt Bestätigungen und Fehlern in beiden Sprachen funktionieren.
21. Als Eigentümer möchte ich Type Pairings auflisten, anlegen, bearbeiten und bei einer Dublette das vorhandene Pairing öffnen, damit ich Schriftkombinationen ohne Änderung ihrer Namen nutzen kann.
22. Als Eigentümer möchte ich Schriftrollen aus Katalog, Adobe Fonts oder lokaler Quelle wählen und fehlende Vorschauen erkennen, damit ich eine Ersatzschrift nicht mit dem Original verwechsle.
23. Als Eigentümer möchte ich ein Type Pairing in ein Brand Kit übernehmen und dort Typografie wählen oder entfernen, damit die vorhandene Kopier- und Speichergrenze verständlich bleibt.
24. Als Eigentümer möchte ich im Generator Pool, Quellfarben, Sperren, Pipette, Zusatzfarben und Kontrastwarnungen in meiner Sprache bedienen, damit ich das Color Scheme gezielt entwickeln kann.
25. Als Eigentümer möchte ich helle und dunkle Generatorvorschauen mit übersetzten Beispieltexten prüfen, damit ich Lesbarkeit in der gewählten Sprache beurteilen kann.
26. Als Eigentümer möchte ich Brand Kits speichern, Hinweise bearbeiten, freigeben, archivieren, löschen und CSS kopieren, damit Status und Bestätigungen verständlich sind und Exporte stabil bleiben.
27. Als Eigentümer möchte ich neue Briefing-Vorlagen und KI-Entwürfe in meiner UI-Sprache erhalten, vorhandenen Text erst nach Bestätigung ersetzen und ausdrücklich speichern, damit ich die Kontrolle über das gespeicherte Briefing behalte.
28. Als Eigentümer möchte ich MCP-Tokens erstellen, kopieren und widerrufen sowie die Werkzeughilfe lesen, damit ich Agenten anbinden kann, ohne technische Namen oder Befehle zu verändern.
29. Als Eigentümer möchte ich auch bei fehlenden Objekten, verweigertem Zugriff und unerwarteten Fehlern verständliche Hinweise und Rücklinks erhalten, damit ich einen nächsten Schritt habe.
30. Als Coding-Agent möchte ich typsichere, vollständige Kataloge und stabile Maschinenverträge vorfinden, damit weitere UI-Sprachen später ohne Änderung von Bibliotheksdaten, Worker oder MCP ergänzt werden können.

## Implementation decisions

### Sprache und Laufzeit

1. Paraglide 2.29.3 und das Message-Format-Plugin 4.5.0 bilden die geprüfte Integrationsbasis. Die Plugin-URL ist versionsfest. Paraglide wird vor den Start- und React-Plugins eingebunden. Nitro und Tailwind bleiben im vorhandenen Aufbau.
2. Ein Wrapper um den vollständigen Start-Handler setzt den Request-Kontext einschließlich SSR, Loadern, Server-Function-Validatoren und Handlern. Handler-Optionen werden weitergereicht. Owner-Gate, CSRF, Body-Limit, Zugriff auf Assets, MCP und Worker sowie `noindex` bleiben wirksam.
3. `baseLocale` ist `en`, die ausgelieferten Locales sind `en` und `de`. Die Strategie ist ausschließlich Cookie, dann Basissprache. `PARAGLIDE_LOCALE` nutzt die im Spike geprüfte Konfiguration mit `SameSite=lax` und `cookieSecure=auto`. Der Cookie gilt auf `/` für beide Sprachen und alle Seiten. Fehlend oder ungültig bedeutet Englisch. Keine Erkennung aus `Accept-Language`, keine Sprache in URL oder Datenbank. Das HTML-`lang` entspricht bereits bei SSR der UI-Sprache; Hydration darf es nicht ändern.
4. Paraglide erzeugt Deklarationen. Der CLI-Compiler läuft vor Router-Generierung und Typecheck, auch ohne vorherigen Entwicklungsserver. Die Konfiguration gehört zum TypeScript-Projekt und damit ins typisierte ESLint; generierte Ausgabe bleibt außerhalb von Git und ESLint. Ein frischer Node-24-Lauf einschließlich Production-Build und gestarteter Nitro-Laufzeit ist vor Produktübernahme Pflicht.

### Kataloge, Inhalte und Verträge

5. Die Web-App besitzt zwei flache Kataloge mit semantischen englischen `snake_case`-IDs. Vollständige Sätze, benannte Parameter, sichere Interpolation und die unterstützte Plugin-Syntax ersetzen Textverkettung. EN und DE haben exakt dieselben IDs und kompatible Parameter-, Selektor- und Pluralverträge. Fehlende, leere oder unparsebare Nachrichten blockieren die Auslieferung. Englischer Laufzeit-Fallback ist kein Ersatz für diese Parität. Der kleine Katalog-Guard prüft die echte Plugin-Struktur und importierte Nachrichten statt Quelltext nach Mustern abzusuchen.
6. Übersetzungen und Formatierung erfolgen bei Verwendung im Request oder Browser. Keine Locale oder übersetzte Fehlermeldung wird beim Modulimport eingefroren; kein globales Setzen der Serversprache. Neutrale Validierungsregeln liefern stabile Codes und typisierte Parameter. Die Web-Grenze übersetzt auch Fehler aus Validatoren vor dem Handler und behält vorhandene Antwortformen. Unbekannte Fehler ergeben einen sicheren allgemeinen UI-Hinweis. Maschinenfehler und HTTP-Statuscodes bleiben stabil.
7. Taxonomie- und andere Enum-Labels liegen als vollständige, typgeprüfte Web-Zuordnungen vor. Fachschlüssel, gespeicherte Tags, Modell-Enums und Sortier-/Filterwerte bleiben stabil. Taxonomie, DB, Shared, Worker und MCP importieren keine generierten Web-Messages. Originale technische Fehlerdetails bleiben separat unter einer übersetzten Beschriftung lesbar; weder ihre Sprache noch Codes werden aus Text erraten.
8. Zahlen erscheinen mit `en-GB` oder `de-DE`; Datums- und Uhrzeitformatierer setzen immer `Europe/Berlin`. Das betrifft auch Upload-Limits, Zeichenanzahlen, Versions-/Versuchszahlen, Kontrastwerte und Vorschauen. Serialisierung, IDs, Hex-/CSS-/URL-Werte, Modellnamen, Schriftfamilien, Codebeispiele und maschinenlesbare Daten werden nicht lokalisiert. Generatorwarnungen und Herkunftstexte erhalten eine Web-Darstellung aus neutralen Daten, ohne bestehende Snapshot- oder MCP-Ausgaben umzuschreiben.
9. Eigentümertexte und gespeicherte Briefings bleiben unverändert. Analysen erzeugen weiterhin beide Inhaltsfassungen in einem Lauf. Die Ansicht startet aus der UI-Sprache; eine manuelle DE/EN-Wahl bleibt für dieselbe Referenz über Polling und neue Versionen erhalten. Nur die generierten Absätze folgen dieser Auswahl und erhalten ihr eigenes `lang`. Eine spätere zusätzliche UI-Sprache verwendet für Analyse und neue Briefings Englisch mit erklärtem Fallback; sie erweitert nicht automatisch den DE/EN-Inhaltsvertrag.
10. Ein neuer Briefing-Aufruf erfasst seine Ausgabesprache einmal am Handler-Eingang und reicht sie explizit an Dienst und Writer. Prompt, Analysequellen, Vorlage und Abschnittsüberschriften folgen ihr. Die öffentliche Eingabe bleibt der vorhandene Slug. Ein Entwurf ändert nur den Editor; Ersetzen erfordert weiterhin die bestehende Bestätigung, Speichern weiterhin die ausdrückliche Aktion. Jobs benötigen keinen UI-Cookie und keine neue Locale-Eingabe. Angenommene Captures, Analyse-, Embedding- und Schriftvorschaujobs laufen sprachunabhängig weiter.

### URLs und gemeinsamer Sprachwechsel

11. Die geprüfte Routenzuordnung gilt vollständig, einschließlich des bestehenden Pairing-Slugs `new` mit eigenem Detailziel. Alte vollständige Seitenmuster liefern für GET/HEAD einen datenunabhängigen 308 vor dem Owner-Gate. Nur feste Segmente ändern sich; der rohe Querystring bleibt erhalten. APIs, Mutationen und Server Functions erhalten keine Seitenredirects. Anmelderückwege werden gemeinsam auf sichere interne bekannte Seiten geprüft und englisch kanonisiert; unsichere oder mehrdeutige Werte führen zu `/`. Erfolg und Fehler bei OAuth erhalten denselben sicheren Rückweg.
12. Alle Sprachauswahlen teilen eine Wechselsteuerung. Erreichbar sind Anmeldung, Einstellungen, Eigentümer-Menü und die fokussierbare Oberfläche offener Editoren, insbesondere Quick Add, Briefing-Panel, Kit-Speicherdialog und Schriftenauswahl. Die Optionen heißen `English` und `Deutsch` mit jeweiligem `lang`. Die Auswahl allein öffnet keine zusätzliche Einstellungsseite.
13. Gleiche Sprache ist immer ein No-op, auch bei lokalen Änderungen oder laufenden Vorgängen. Ein tatsächlicher sauberer Wechsel schreibt den Cookie genau einmal und lädt genau einmal dieselbe aktuelle URL neu. Ausstehende URL-Serialisierung für Generator und Galerie-Suche wird vorher abgeschlossen; aktuelle Query und Hash bleiben erhalten. Fehler beim Cookie-Schreiben setzen die Auswahl zurück und zeigen einen lokalisierten Fehler, ohne Eingaben zu verlieren.
14. Ungespeichert ist eine verlierbare Abweichung vom zuletzt erfolgreich gespeicherten oder initial geladenen Stand, gemessen mit der bestehenden feldspezifischen Normalisierung. Initiale Defaults sind sauber. Rückkehr zu exakt diesem Stand ist wieder sauber. Validierungs- und Netzwerkfehler setzen die Basis nicht zurück. Bei erlaubter weiterer Bearbeitung während eines Saves wird nur die bestätigte gesendete Fassung zur neuen Basis.
15. Der gemeinsame Schutz erfasst Referenz-/Inline-Felder, noch nicht übernommene Tagtexte, Sammlungsformulare, URL-Importfelder, lokale Dateien, neue markierte Bereiche, Pairing-/Schriftauswahl, Kit-Hinweise, Typografie, Speicherdialog, lokale Farbtexte/-namen und Token-Eingaben. Ein erzeugtes oder aus Vorlage eingefügtes Briefing gilt sofort als ungespeichert, auch nach Schließen des Panels. Bereits URL-kodierter Color-Scheme-/Pool-Zustand bleibt beim Reload erhalten und braucht allein keine Verlustwarnung. Vorschau, Hover, Undo-Verlauf und reine Katalogsuche dürfen zurückgesetzt werden.
16. Bei verlierbaren Eingaben erscheint eine gemeinsame Warnung in der aktiven UI-Sprache. Sie erklärt Reload, Verlust lokaler Eingaben und Erhalt gespeicherter Inhalte sowie angenommener Jobs. Abbrechen erhält zuerst den Fokus; Escape entspricht Abbrechen, Auswahl und Fokus kehren zum Auslöser zurück. Cookie, URL und Eingaben bleiben unangetastet. Bestätigen verwirft ausschließlich den lokalen Zustand und bewirkt genau einen Cookie-Schreibvorgang und Reload, auch bei Mehrfachklick. Nur für diesen bestätigten Reload wird die bestehende `beforeunload`-Warnung einmalig umgangen. Abbruch lässt sie aktiv. Die bisherige Briefing-Navigations- und Ersetzen-Bestätigung bleibt unabhängig erhalten.
17. Laufende browsergebundene Mutationen, Speichern, KI-Briefingerzeugung, OAuth-Start und die gesamte lokale Mehrfach-Upload-Schleife blockieren einen tatsächlichen Wechsel mit konkretem Grund. Es gibt keinen vorgemerkten Wechsel. Nach Abschluss muss neu gewählt werden. Nach Fehler bleiben verbliebene lokale Dateien und Änderungen geschützt. Bereits serverseitig angenommene Jobs blockieren nicht, behalten Identität und Fortschritt und werden nach Reload erneut gelesen. Ein neuer Klartext-MCP-Token blockiert bis "Fertig", auch wenn er bereits kopiert wurde. Der Cookie wird bei Blockern nicht geschrieben. Blocker haben Vorrang vor einer Verlustwarnung und werden vor dem endgültigen Cookie-Schreiben erneut geprüft; ihre Auflösung löst niemals automatisch einen Wechsel aus.

## Testing decisions

Prüfungen beobachten sichtbares Verhalten und bestehende Systemgrenzen. Sie testen keine Nachbildung dieser Prosa und keine internen Hook-Aufrufzahlen. Die vollständige [Abnahmematrix](catalogs-and-acceptance.md#abnahme-der-späteren-produktmigration) ist verbindlich. Automatisierte Prüfungen decken Risiken ab; Browserdurchgänge ergänzen Bedienbarkeit und Layout.

| Grenze | Vorhandene Grundlage und gezielte Ergänzung |
| --- | --- |
| Request, SSR und Auth | `owner-access` und der vorhandene In-process-Testserver: fehlender/ungültiger Cookie, beide Locales, `html lang`, parallele EN/DE-Requests über `await`, unveränderte Owner-/CSRF-/Body-Prüfungen. Direkte Server Functions ohne Seitennavigation einschließen. |
| Frühe Validierung | Referenz-, Upload-, Sammlungs-, Pairing-, Kit- und Tokenfälle an bestehenden Server Functions. Mindestens ein Schema auf Modulebene und ein `.validator`-Fehler vor dem Handler parallel in beiden Sprachen. Grenzwerte und Antwortformen bleiben gleich. |
| URLs und Anmeldung | `lib/sign-in`, `owner-access` und `generator-entry-points`: alle alten Muster per Tabelle, HEAD/GET und ausgeschlossene Methoden, Query/Hash, kodierte Segmente, unsicheres `next`, OAuth-Fehler, Slug `new` und idempotente Ziele. |
| Kataloge und Labels | Ein kleiner Guard mit Vitest, Node und dem versionsgleichen Message-Format-Plugin prüft die realen EN/DE-Dateien unabhängig voneinander. Vollständige Enum-Mappings und die tatsächlichen generierten Deklarationen gehören dazu. |
| Fachabläufe | `import-jobs`, `analysis`, `kit-briefing`, `type-pairings`, `kit-typography`, `brand-kits` und vorhandene Generator-Einstiegstests erweitern. Kein neuer Testserver je Formular. Quellen, Eigentümertexte, explizite Speichergrenze und unabhängige Inhaltswahl nachweisen. |
| Maschinenverträge | Bestehende MCP-Schema-/Werkzeug-, Brand-Kit-MCP- und Worker-Prüfungen: UI-Cookie ändert keine Keys, Enums, Inputs, Fehlerverträge oder Daten. Shared-Snapshots und CSS bleiben kompatibel. Nur ausgegebene Seitenlinks folgen der Routenentscheidung. |
| Formatierung | Kleine feste Werte für beide Locales, Dezimal-/Tausendertrennung sowie Berlin-Winterzeit, Sommerzeit und Datumsgrenze. Keine Änderung serialisierter Zeitstempel. |
| Browser | Reale geänderte Ansichten aus der Matrix mit realistischen synthetischen Daten in EN/DE bedienen. Sprachwechsel, Dirty-/Pending-Fälle, einmal sichtbaren Token, native modale Editoren, Fokus, Query-Flush und Hydration prüfen. Desktop und tatsächlich gemessene mobile Breite für responsive Änderungen. |
| Frischer Checkout | Unter Node 24 mit eingefrorenem Lockfile installieren. Ohne generierte Messages oder vorherigen Dev-Server kompilieren, Guard, Typecheck und Lint ausführen. Production-Build erzeugen und Nitro mit isolierten Testdaten für SSR, direkte Aufrufe und Zugriffsschutz prüfen. Ein grüner Typecheck allein genügt nicht. |

Spätere schwere lokale Prüfungen laufen über `heavy-check`; passende vollständige CI-Nachweise ersetzen doppelte lokale Gesamtläufe. Die vorhandene CI nutzt Node 24, Postgres und Chromium, führt aktuell aber keinen Production-Build aus. Die Produktmigration muss diesen fehlenden Build-/Runtime-Nachweis ausdrücklich liefern.

Dieser Dokumentationsauftrag führt nur Quellen-, Link-, Tabellen- und Diff-Prüfungen aus. Er behauptet keine erfolgreiche Produktabnahme und benötigt weder App-Screenshots noch Vollsuite, Typecheck oder Build. Der Koordinator übernimmt Review und CI des kombinierten Dokumentations-PRs.

## Out of scope

- Produktmigration, Deployment und Runtime-Konfiguration in diesem Dokumentations-PR.
- Weitere ausgelieferte UI-Sprachen, zusätzliche KI-Inhaltssprachen und automatische Browser-Spracherkennung.
- Datenbankmigration, Locale-Spalten, neue Job-Sprachdaten oder rückwirkende Übersetzung technischer Fehler.
- Automatische Übersetzung von Eigentümertexten, Projekt-Tags, gespeicherten Slugs oder Briefings.
- Kontoweite oder geräteübergreifende Sprachpräferenz, lokalisierte Routen und Sprachpräfixe.
- Autosave, persistente lokale Entwürfe, dauerhafte Browser-Upload-Queue und neue Produktansichten.
- Neue Pairing-Archiv-, Lösch-, Such- oder Größenregler in der Oberfläche. Diese sind im vorhandenen Code teilweise erst als Folgearbeit erwähnt und werden durch die Übersetzung nicht eingeführt.
- Übersetzung von MCP-Toolnamen, API-Feldern, Enum-Werten, CSS-/Storage-Keys und `INSPO_*`.
- Übernahme des HTML-Prototyps, Spike-Codes oder deren Testinfrastruktur in `main`.

## Further notes

### Kleinste prüfbare spätere Migrationsfolge

1. Die geprüfte Runtime-Integration und Kataloggrundlage einführen. Compiler vor Typecheck, Deklarationen, Konfigurationsprüfung und Katalog-Guard von Beginn an aktivieren. Erstbesuch, Request-Isolation und Node-24-Production-Lauf als technische Eintrittsprüfung belegen.
2. Gemeinsame Seitenzuordnung, sämtliche Linkquellen, sichere Rückwege und Legacy-Redirects zusammen migrieren. Tabellenprüfungen und bestehende Zugriffstests müssen bestehen, bevor neue englische Links ausgeliefert werden.
3. Gemeinsame Web-Label-, Fehler- und Formatierungsgrenzen umsetzen, einschließlich früher Validatoren und neutraler Generator-Diagnostik. Maschinenverträge bleiben dabei überprüfbar stabil.
4. Alle Ansichten und eingebetteten Zustände anhand der Matrix auf vollständige EN/DE-Kataloge umstellen. Analyseanzeige und Briefingerzeugung an den beschlossenen Inhaltsvertrag anschließen. Katalogparität gilt für jeden neu eingeführten Schlüssel von Anfang an.
5. Gemeinsamen Sprachwechsel an alle verlierbaren Eingaben und Pending-Zustände anschließen. Die sichtbaren Sprachwahlen erst zusammen mit diesem Schutz freigeben. URL-Flush, modale Erreichbarkeit und Token-Sonderfall im echten Browser prüfen.
6. Kombinierten Produktstand in frischem Node-24-Checkout und CI prüfen. Matrix mit tatsächlichen EN/DE-Browsernachweisen abschließen, Desktop/Mobile-Screenshots der geänderten Ansichten zeigen und vor Merge einer größeren UI-Änderung das erforderliche OK einholen. Erst danach ist die Produktmigration abgenommen.

Diese Folge ist eine Übergabe an die spätere Umsetzung, keine Anlage oder Freigabe von Umsetzungstickets. Kleine interne Schritte sind möglich; ein auslieferbarer Zwischenstand darf keine gemischte halbfertige UI oder ungeschützte Sprachwahl veröffentlichen.

### Vorliegende Nachweise und Grenzen

- Der [Runtime-Spike](https://github.com/dmontinaro/m3-inspo/blob/e5304d1084789d93d0c07f15e01e32444c26db61/docs/research/paraglide-runtime-spike.md) belegt den Source-Commit `877fde459b6f8f29ee3c02f3151eb203684df3cc` unter Node 26.12.1: Typecheck, Build, 24 parallele direkte Server-Function-Aufrufe, SSR und gestarteter Nitro-Output. Er belegt weder Node 24 noch die bestehende gesamte UI oder die Migration aller Modulebene-Schemas.
- Der verlinkte Logik-Prototyp belegt elf Browserführungen mit 46 Aktionen im Child. Der Koordinator hat ihn gerendert und die elf Zustandsausgänge sowie URL-/Cookie-/Reload-Invarianten selbst geprüft. Cookie, Reload und Hintergrundarbeit waren simuliert. Eine interaktive Prüfung mit tatsächlich mobiler Browserbreite ist nicht belegt; die mobile Standansicht ersetzt sie nicht. Reale Token-Ausgabe, URL-Flush und App-Integration stehen ebenfalls noch aus.
- Kein persönlicher Nutzertest oder separates Detail-OK des Eigentümers wird aus diesen Agent-Prüfungen abgeleitet. Die Bewertung erfolgte im bestätigten Autopilot-Auftrag.
- Die beiden unverändert übernommenen Detailverträge stammen aus `a29802197c7b98b47244cf593745990cc7cfb71d` und `0b9f695e7a22ffcbcd7f72f1814844622dcd05a5`. Der feste Prototyp-Befund stammt aus `1724efa4be29998b8643c102c2398796f5b406b0`.

Für den definierten Planungsumfang bleiben keine offenen Produktfragen. Node-24-Lauf, reale Browserabnahme und vollständige Übersetzungen sind spätere Umsetzungsnachweise, keine stillschweigenden Freigaben durch diese Spec. Veröffentlichung, Tracker-Abschluss, Spec-Label und Merge des gemeinsamen Dokumentations-PRs liegen beim Koordinator.
