# m3 inspo

Private Designbibliothek: der Eigentümer sammelt Referenzen mit eigenen Notizen, Coding-Agenten lesen sie über MCP.

## Language

### Bibliothek

**Projekt**:
Ein eigener Tag (z. B. `harbor`), der Referenzen, Sammlungen und Brand Kits einem eigenen Vorhaben zuordnet. Es gibt kein Projekt-Objekt neben dem Tag.
_Avoid_: Vorhaben (als eigener Begriff), Workspace

**Bereich**:
Ein Rechteck, das der Eigentümer auf einer Aufnahme markiert, mit Komponententyp und Notiz. Die Web-App schneidet es zu und speichert den Zuschnitt; Agenten finden Bereiche über `find_components`. Das Rechteck bleibt fest, Typ und Notiz lassen sich ändern.
_Avoid_: Teilreferenz, Ausschnitt, Region (in deutschen Texten; im Code heißt es `region`)

**Komponententyp**:
Die Art eines Seitenabschnitts, z. B. Navigation, Hero oder Preise (`COMPONENT_TYPES` in `@m3-inspo/taxonomy`). Gröber als die Komponenten-Tags der KI-Analyse (`sticky-nav`, `hero-with-cta`), die eine ganze Seite beschreiben.
_Avoid_: Komponente (allein), Sektion

**Format**:
Wofür eine Referenz gemacht ist: Desktop oder Mobile (eine App oder eine mobile Website). Ein Upload im Seitenverhältnis eines Handy-Bildschirms startet als Mobile, der Eigentümer kann es ändern. Die Galerie zeigt Mobile-Referenzen in einem Handy-Rahmen und filtert danach; Agenten finden sie mit `device: "mobile"`. Im Code heißt es `device`.
_Avoid_: Gerät, Viewport (das ist die Ansicht einer Aufnahme)

**KI-Analyse**:
Was ein Modell aus den Aufnahmen einer Referenz erzeugt: Tags aus der Taxonomie, Beschreibung und Aufbau auf Deutsch und Englisch, dazu geschätzte Designwerte mit der Herkunft `vision`. Versioniert und mit dem erzeugenden Modell; die neueste Version gilt. Steht immer getrennt von den Notizen des Eigentümers.
_Avoid_: Notiz, Beschreibung (allein, für die generierten Texte)

### Farben

**Palette**:
Die aus einer Referenz gemessenen Farben (aus dem DOM oder aus Bildpixeln), mit Herkunft. Beschreibt, was da ist, nie einen Entwurf.
_Avoid_: Farbschema, generierte Palette

**Brand Kit**:
Ein vom Eigentümer gespeicherter Satz von Gestaltungsgrundlagen, höchstens einem Projekt zugeordnet (z. B. Harbor). Es enthält ein Color Scheme und optional eine Typografie. Freigegeben heißt es „gilt für sein Projekt“: Pro Projekt ist höchstens ein Brand Kit freigegeben, daneben beliebig viele Entwürfe. Es trägt die **Hinweise** des Eigentümers zur Verwendung (z. B. „Orange nur für Haupt-Aktionen“), die Agenten wie Notizen als Referenzdaten lesen.
_Avoid_: Theme, Style, Branding

**Color Scheme**:
Der Farbteil eines Brand Kits: Quellfarben, daraus abgeleitete Skalen und Rollen (Hintergrund, Text, Primärfarbe …), entworfen statt gemessen, mit Verweis auf die Referenzen, aus denen es entstanden ist. Vorerst nur hell.
_Avoid_: Palette, Farbpalette

**Quellfarbe**:
Eine der Farben, aus denen ein Color Scheme entsteht: die Marke, das Neutral und bis zu fünf Zusatzfarben. Jede trägt eine Sperre und ihre Herkunft (aus einer Referenz übernommen, gewürfelt oder von Hand).
_Avoid_: Slot, Basisfarbe

**Sperre**:
Wie viel einer Quellfarbe beim Würfeln erhalten bleibt: offen, Farbton oder exakt. Von Hand angepasste Farben sind exakt gesperrt.
_Avoid_: Fixierung

**Skala**:
Die aus einer Quellfarbe abgeleitete Abstufung von hell nach dunkel (Stufen 50 bis 950), benannt nach ihrer Quellfarbe (`brand`, `neutral`, frei benannte Zusatzfarben). Die **Signal-Skala** (`danger`) ist die Ausnahme: aus der Marke abgeleitet, ohne eigene Quellfarbe, für Fehler.
_Avoid_: Ramp, Shades, Skala (für Schriftgrößen, das ist die Typo-Skala)

**Rolle**:
Die benannte Verwendung einer Farbe in einer Oberfläche, z. B. `primary` für Haupt-Buttons oder `muted-foreground` für Nebentext. Rollen folgen aus den Skalen, sie werden nie direkt gewählt.
_Avoid_: Token, Akzent (`accent` ist eine Hover-Fläche, keine zweite Markenfarbe)

**Generator**:
Der Spielplatz in der Web-App, in dem der Eigentümer ein Color Scheme erwürfelt. Flüchtig: Erst Speichern legt ein Brand Kit an. Agenten erzeugen Color Schemes nur zustandslos und reichen sie per Link an den Generator weiter; speichern kann nur der Eigentümer.
_Avoid_: Editor, Builder

**Pool**:
Die Referenzen, aus deren Paletten der Generator würfelt: alle freigegebenen, die eines Projekts oder die einer Sammlung. Ohne Farben im Pool würfelt der Generator frei, ohne Bezug zum Geschmack des Eigentümers.
_Avoid_: Würfel-Pool (im Glossar), Quelle, Auswahl

### Schriften

**Type Pairing**:
Eine vom Eigentümer gemerkte Schriftkombination in der Bibliothek, unabhängig von Projekten: je Schriftrolle eine Familie mit ihren Gewichten. Gemerkt heißt gültig, Archivieren blendet es aus. Ein Brand Kit übernimmt ein Type Pairing als Kopie; das Pairing bleibt nur als Herkunft verknüpft. Nicht zu verwechseln mit den Schriften einer Referenz, die gemessen sind. In der Web-App leben Type Pairings im eigenen Bereich „Schriften“, nicht in der Galerie der Referenzen.
_Avoid_: Schriftpaar, Font-Pairing, Fonts (allein)

**Schriftrolle**:
Wofür eine Schrift in einem Type Pairing oder einer Typografie steht: `heading`, `body`, optional `mono`. Mehrere Schriftrollen dürfen dieselbe Familie haben.
_Avoid_: Rolle (allein, das ist eine Farbrolle), Stufe (`h1`, `body` sind Stufen der Typo-Skala)

**Typografie**:
Der Schriftteil eines Brand Kits: Schriftrollen, als Werte übernommen aus einem Type Pairing oder direkt gesetzt, und optional eine Typo-Skala. Ein Brand Kit kann auch ohne Typografie auskommen.
_Avoid_: Type Pairing (für den Teil im Kit), Fonts

**Typo-Skala**:
Die entworfenen Schriftgrößen einer Typografie, benannt nach ihrer Verwendung (`display`, `h1`, `h2`, `h3`, `body`, `small`). Jede Stufe hat Größe, Zeilenhöhe, Laufweite, Gewicht und Schriftrolle. Sie entsteht aus Grundgröße und Verhältnis oder aus den gemessenen Schriftgrößen einer Referenz und lässt sich danach von Hand anpassen.
_Avoid_: Skala (allein), Type Ramp (im Code heißen die gemessenen Werte `typeRamp`)
