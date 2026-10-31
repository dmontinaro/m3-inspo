# m3 inspo: Architektur und Verhalten

m3 inspo ist eine selbst hostbare, private Designbibliothek mit einem Eigentümer pro Installation. Sie sammelt Referenzen und persönliche Gestaltungsnotizen. Coding-Agenten lesen den freigegebenen Teil über MCP. Die Begriffe stehen in [CONTEXT.md](../CONTEXT.md).

## Komponenten

- `apps/web`: TanStack Start mit React und Nitro. Seiten, Server Functions, Owner-Zugang, Bildspeicher, Worker-API und MCP-HTTP-Endpunkt laufen hier.
- `apps/worker`: Playwright-Capture für öffentliche URLs und Schriftvorschauen. Der Worker erhält nur App-Origin und Worker-Token, keine Datenbank- oder Bucket-Zugangsdaten.
- `packages/db`: Postgres mit pgvector, Drizzle-Schemas und unveränderliche Migrationen, Abfragen, Suche und Katalog für MCP.
- `packages/mcp`: Werkzeuge, Profile, Bild- und Antwortbudgets. Pro Anfrage wird ein Server mit dem aktuellen freigegebenen Katalog erstellt.
- `packages/shared` und `packages/taxonomy`: frameworkunabhängige Typen, Gestaltungswerte, Farbmathematik und Taxonomie.

## Zugang und Daten

GitHub OAuth lässt nur die numerische `OWNER_GITHUB_ID` zu. Die globale Middleware verweigert alle anderen Zugriffe auf Seiten, Server Functions, Exporte und Bilder. Auth-Endpunkte und Login bleiben öffentlich erreichbar. MCP und Worker-API prüfen eigene Tokens statt Session-Cookies.

MCP-Tokens werden gehasht gespeichert und können ablaufen oder widerrufen werden. Die Bibliothek besitzt keine Trennung nach mehreren Nutzern oder Mandanten. Öffentliche Registrierung wäre deshalb eine Änderung an Architektur und Datenmodell.

Bilder liegen in einem privaten lokalen Verzeichnis oder S3-kompatiblen Bucket. Uploads werden geprüft und neu kodiert. Die Web-App liefert Bilder über ihre geschützte Asset-Route aus. Kurzlebige Upload-URLs erlauben dem Worker das Hochladen einzelner Ergebnisse.

## Bibliothek und Verarbeitung

Referenzen haben den Status Entwurf, freigegeben oder archiviert. Quelle, Bilder, markierte Bereiche, eigene Tags, Favoriten sowie Übernehmen-, Vermeiden- und Fokus-Notizen gehören zur Referenz. Projekte werden durch eigene Tags bezeichnet; es gibt kein separates Projektobjekt.

Import-Jobs verwenden Leases, Versuche und Heartbeats. Der Worker nimmt einen Job an, lädt die öffentlichen Seiten durch einen Guard-Proxy und meldet Aufnahmen und gemessene Gestaltungswerte zurück. Die Web-App validiert das Ergebnis, speichert die Referenz als Entwurf und plant optionale KI- und Embedding-Jobs.

Gemessene Werte und KI-Schätzungen tragen ihre Herkunft. Generierte Beschreibungen bleiben von menschlichen Notizen getrennt. Ohne Provider-Schlüssel bleiben Upload, Capture, Kuratierung und Textsuche verfügbar. Die Datenflüsse sind in [self-hosting.md](self-hosting.md) beschrieben.

## Brand Kits und Schriften

Brand Kits speichern Color Schemes mit einer Momentaufnahme ihrer berechneten Skalen und Rollen. Optional enthalten sie Typografie und ein Design-Briefing. Pro Projekt ist höchstens ein Kit freigegeben. Änderungen geschehen durch ausdrückliches Speichern.

Type Pairings sind eigene Schriftkombinationen. Ein Brand Kit übernimmt ihre Werte als Kopie. Fontsource liefert einen lokalen Metadatenkatalog; Adobe Fonts ist optional. Projektspezifische Briefings gehören in die Datenbank, nicht in den Quellcode.

## MCP-Vertrag und Prüfungen

Agenten sehen freigegebene Referenzen und Kits. Notizen, Website-Inhalte und KI-Texte sind Referenzmaterial, keine Anweisungen. Werkzeugnamen und Schemas werden durch einen Snapshot und Tests geprüft. Eine beabsichtigte Schemaänderung aktualisiert auch den Snapshot.

CI prüft TypeScript, Lint und Vitest mit Postgres und Chromium. Für neue Funktionen werden gezielte Tests ergänzt. Für Änderungen an Datenmodell oder Zugriffsschutz sind passende Integrationstests erforderlich.
