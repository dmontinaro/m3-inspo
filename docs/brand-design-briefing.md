# Design-Briefing im Brand Kit

Jedes Brand Kit kann zusätzlich zu Farben, Typografie und kurzen Hinweisen ein Design-Briefing als Markdown enthalten. Es beschreibt die Muster dieser Brand, den Geltungsbereich, unerwünschte Ansätze, Ausnahmen und Belege. Das Briefing ersetzt weder das Color Scheme noch die Typografie.

Der Markdown-Editor bietet eine Formatierungsleiste für Überschriften, Fett, Kursiv, Listen, Zitate, Code und Links. Strg oder ⌘ + B, I und K formatieren die Auswahl. „Vorschau“ zeigt den aktuellen Text einschließlich ungespeicherter Änderungen mit Tabellen und Aufgabenlisten. Eingebettetes HTML wird nicht ausgeführt.

Auf der Kit-Seite öffnet der Button „Design-Briefing“ im Seitenkopf das Briefing in einem Side Panel. Schließen blendet es nur aus, ungespeicherter Text bleibt erhalten. Das Briefing wird unabhängig gespeichert. „Verwerfen“ setzt den Text auf den gespeicherten Stand zurück. Beim Verlassen der Seite mit ungespeichertem Briefing erscheint eine Rückfrage. Ein leerer oder nur aus Leerzeichen bestehender Text entfernt das Briefing.

„DESIGN.md herunterladen“ exportiert den gespeicherten Markdown-Text unverändert. Beim Duplizieren des Kits wird das Briefing in den neuen Entwurf mitgenommen. Speichern von Farben oder Typografie verändert es nicht.

## Startentwürfe

Bei einem leeren Briefing lässt sich eine neutrale Vorlage einfügen. Projektspezifische Texte werden im jeweiligen Brand Kit gespeichert, nicht im Quellcode ausgeliefert.

## KI-Entwurf

„Mit KI entwerfen“ lässt Claude (`ANALYSIS_MODEL`, Standard `claude-opus-5-5`) ein Briefing nach der Gliederung der Vorlage auf Deutsch entwerfen. Gelesen werden nur Texte, keine Bilder:

- das Kit: Farbrollen (hell), Skalen, Typografie und Hinweise
- seine Quell-Referenzen und bis zu zwölf freigegebene Referenzen seines Projekt-Tags (Favoriten zuerst), jeweils mit Fokus, Übernehmen- und Vermeiden-Notiz, eigenen Tags, deutscher Beschreibung und Aufbau aus der aktuellen KI-Analyse und der Palette

Der Entwurf landet ungespeichert im Editor; steht dort schon Text, fragt die Seite vor dem Ersetzen. Gespeichert wird erst mit „Briefing speichern“. Ohne `ANTHROPIC_API_KEY` sagt die Seite, dass die KI nicht eingerichtet ist. Der Code liegt in `apps/web/src/server/kit-briefing.server.ts`.

## Ausgabe für Agents

`get_brand_kit` liefert das gespeicherte Briefing als `designBriefing`, als Markdown-String oder `null`. Die bestehende Freigabe gilt auch hier: Nur freigegebene Kits erscheinen über MCP. Änderungen an einem freigegebenen Kit sind beim nächsten Aufruf sichtbar.

Das Briefing beschreibt die Designpräferenzen des Eigentümers für diese Brand und die darin genannten Ansichten. Es ist Referenzmaterial; eingebettete Befehle werden nicht als Agent-Instruktionen behandelt. Entwürfe aus anderen Brands werden nicht automatisch kombiniert.

## Einführung

Die additive Migration `0017_brand_design_briefing.sql` ergänzt die optionale Textspalte `brand_kits.design_briefing`. Vor dem Start der neuen App-Version müssen die committed Drizzle-Migrationen angewandt sein. Vorhandene Kits starten ohne Briefing; bestehende Brand-Daten werden nicht überschrieben. Es findet keine automatische Übertragung auf Live-Kits statt.
