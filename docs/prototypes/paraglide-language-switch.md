# Sprachwechsel bei ungespeicherten Eingaben

Ergebnis zu [Sprachwechsel mit ungespeicherten Eingaben konkret prüfen](https://github.com/dmontinaro/m3-inspo/issues/6). Untersuchte Codebasis: `3151aa30dc20c4f2d73e35974c52915bc02650b0`.

Der [einzelne HTML-Prototyp](paraglide-language-switch.prototype.html) lässt sich ohne Installation im Browser öffnen. Er bleibt auf seinem verwerfbaren Arbeitsbranch und gehört nicht nach `main`. Der Koordinator übernimmt ausschließlich die Entscheidungen in die spätere Spec.

Die folgenden Detailentscheidungen sind Defaults im ausdrücklich delegierten Autopilot-Auftrag. Der Koordinator bewertet sie für die Spec. Domenico hat diesen Prototyp weder persönlich ausprobiert noch das gewählte Detailverhalten abgenommen. Das ursprüngliche Ticket verlangt diese persönliche Bewertung; der aktuelle Auftrag ersetzt sie durch die delegierte Bewertung.

## Entscheidung

| Ausgangslage | Verhalten |
| --- | --- |
| Bereits aktive Sprache ausgewählt | Keine Warnung, kein Cookie-Schreiben, kein Reload. Auch bei ungespeicherten Eingaben und laufenden Vorgängen. |
| Andere Sprache, kein Verlust lokaler Eingaben | Sprach-Cookie einmal setzen, dieselbe aktuelle URL mit unveränderter Query und vorhandenem Fragment einmal neu laden. Keine Sprachpräfixe. |
| Andere Sprache, lokale Eingaben oder Briefing-Entwurf | Eine gemeinsame Warnung für alle betroffenen Eingaben dieser Seite. Bis zur Antwort bleiben Cookie, aktive Sprache, URL und Inhalte unverändert. |
| Warnung abbrechen oder Escape | Auswahl auf aktive Sprache zurücksetzen. Alle Werte und der bisherige Cookie bleiben erhalten; kein Reload. Fokus zurück zur auslösenden Sprachauswahl. |
| Verwerfen bestätigen | Erst jetzt Cookie setzen und einmal neu laden. Ungespeicherte lokale Formulardaten und Briefing-Entwürfe verwerfen. Gespeicherte Eigentümer-Inhalte bleiben unverändert und werden nicht übersetzt. Mehrfachklick löst keinen weiteren Wechsel aus. |
| Werte wieder auf gespeichertem Stand | Wieder sauber, auch nach vorheriger Bearbeitung. Ein dauerhaftes Flag nach dem ersten Tastendruck reicht nicht. |
| Speichern oder andere browsergebundene Mutation läuft | Tatsächlichen Wechsel vorübergehend blockieren und Auswahl zurücksetzen. Konkreten Grund anzeigen. Kein vorgemerkter Wechsel; nach dem Ergebnis erneut wählen. |
| Briefing wird gerade erzeugt | Ebenso kurzzeitig blockieren. Die Antwort darf nicht durch einen Reload verloren gehen. Nach Empfang zählt der Entwurf sofort als ungespeichert. |
| Nicht angenommene Datei oder Browser-Upload-Warteschlange | Eine nur ausgewählte Datei zählt als lokale Eingabe. Während Übertragung und bis zur Abwicklung der gesamten lokalen Warteschlange blockieren. Fehler beenden den Blocker, verwerfen aber keine verbleibenden lokalen Dateien. |
| Bereits angenommener Hintergrund-Job | Sprachwechsel bricht ihn nicht ab, startet ihn nicht erneut und ändert seine Identität nicht. Nach Reload vorhandenen Status erneut lesen. |
| Neu erstellter MCP-Token noch sichtbar | Wechsel bis zum vorhandenen Button "Fertig" blockieren. Hinweis: "Kopiere den neuen Token und schließe mit Fertig ab, bevor du die Sprache wechselst." Der Klartext existiert nur im Seitenzustand. |

Englisch ist die Basissprache ohne Cookie. Deutsch wird nur manuell pro Browser gewählt. Kein `Accept-Language`. Die Cookie-Konfiguration und Routen-Zuordnung bleiben in den parallelen Entscheidungen des Koordinators.

### Warnung und Bedienung

Die Warnung erscheint in der **aktiven** UI-Sprache. Abbrechen erhält zuerst den Fokus. DE-Text:

> Sprache wechseln? Nicht gespeicherte Eingaben und Briefing-Entwürfe gehen verloren. Die Seite wird in der gewählten Sprache neu geladen. Gespeicherte Inhalte und gestartete Hintergrund-Jobs bleiben erhalten.

Buttons: "Abbrechen" und "Verwerfen und wechseln". EN-Text:

> Change language? Unsaved input and briefing drafts will be lost. The page will reload in the selected language. Saved content and accepted background jobs will be kept.

Buttons: "Cancel" und "Discard and switch". Die spätere Umsetzung verwendet übersetzbare Nachrichten statt dieser fest eingebauten Demo-Texte. Fehlgeschlagenes Cookie-Schreiben zeigt einen lokalisierten Fehler, setzt die Auswahl zurück und lässt Eingaben unangetastet.

Die Auswahl bietet `English` und `Deutsch` mit eigenem `lang`-Attribut. Sie steht auf der Anmeldung und in den Einstellungen, zusätzlich direkt im Eigentümer-Menü, ohne Navigation zu den Einstellungen. So ist sie während der Bearbeitung erreichbar. Überlagernde Editoren und native modale Dialoge brauchen dieselbe Auswahl innerhalb ihrer eigenen fokussierbaren Oberfläche: insbesondere Briefing-Panel, Quick Add, Brand-Kit-Speicherdialog und Schriftenauswahl. Ein `showModal()`-Dialog macht den Header dahinter unbedienbar; ein Header-Selektor allein genügt deshalb nicht. Alle Instanzen nutzen denselben Wechselzustand und dieselbe Warnung.

Ein bestätigter Sprachwechsel darf nicht zusätzlich die vorhandene `beforeunload`-Warnung auslösen. Die Umsetzung umgeht sie gezielt für diesen einen bereits bestätigten Reload. Bei Abbruch bleibt der Schutz aktiv. Die bestehende Briefing-Navigationswarnung bleibt ebenfalls wirksam; ein Sprachwechsel mit gleicher URL darf nicht nur an einer geänderten `pathname` erkannt werden.

## Welche vorhandenen Eingaben geschützt werden

Als ungespeichert gilt eine verlierbare Abweichung vom zuletzt erfolgreich gespeicherten oder anfänglich geladenen Vergleichsstand. Neue Formulare vergleichen mit ihren initialen Defaults. Ein vorausgefüllter Standardwert allein ist keine Bearbeitung. Eine neu gewählte Datei, ein markierter neuer Bereich und ein erzeugter oder aus einer Vorlage eingefügter Briefing-Text zählen dagegen unmittelbar.

Der Vergleich verwendet die vorhandene feldspezifische Speicher-Normalisierung. Nicht pauschal alle Texte trimmen: Briefing-Formatierung ist Inhalt. Tags vergleichen ihre kanonischen Werte; auch noch nicht bestätigter Text im Tag-Eingabefeld ist verlierbar. Nur ein erfolgreicher Server-Speicherstand setzt die Basis neu. Validierungs-, Duplikat- und Netzwerkfehler bleiben ungespeichert. Werden während eines Saves weitere Änderungen erlaubt, gilt die bestätigte gesendete Fassung als Basis, nicht blind der aktuelle Editorwert.

| Bestehende Oberfläche und Quelle | Geschützte Eingaben / genaue Grenze |
| --- | --- |
| [Referenzformular](../../apps/web/src/components/reference-edit-form.tsx), [InlineField](../../apps/web/src/components/inline-field.tsx), [Referenzdetail](../../apps/web/src/routes/_library/referenzen.$slug.tsx) | Titel, Fokus, Format, Übernehmen, Vermeiden, Tags, Quelle, Urheberhinweis. Inline-Felder und Gesamtformular melden denselben Schutzfall, ohne doppelte Warnung. |
| [TagInput](../../apps/web/src/components/tag-input.tsx) | Hinzugefügte/entfernte Tags und noch nicht als Tag übernommener Eingabetext. Vorschlagsfokus selbst ist keine Änderung. |
| [CollectionForm](../../apps/web/src/components/collection-form.tsx) | Name, Projekt und Beschreibung einer neuen oder bearbeiteten Sammlung. |
| [UrlImportForm](../../apps/web/src/components/url-import-form.tsx) | Noch nicht eingereichte Adresse, Titel, Notizen und Tags. Beim Erstellen des Jobs bis zur Antwort blockieren; nach Annahme gehört der Job dem Server. Bestehende Request-ID-Wiederverwendung nicht ändern. |
| [QuickAddSheet](../../apps/web/src/components/quick-add-sheet.tsx), [QuickAdd](../../apps/web/src/components/quick-add.tsx) | Lokale Datei plus Titel, Übernehmen, Vermeiden, Tags und Quelle. Ein ausgewähltes Bild ist auch ohne getippten Text verlierbar. Die Mehrfach-Upload-Schleife hält Dateien aktuell ausschließlich im Browser. Bis alle abgewickelt sind blockieren, keine neue dauerhafte Upload-Queue bauen. |
| [Bereiche](../../apps/web/src/components/capture-figure.tsx) | Neues markiertes Rechteck, Komponententyp und Notiz; bei bestehenden Bereichen geänderter Komponententyp und Notiz. Reiner Hover oder Markierungsmodus ohne Rechteck ist keine Eingabe. |
| [PairingEditor](../../apps/web/src/components/pairing-editor.tsx), [RoleFontPicker](../../apps/web/src/components/role-font-picker.tsx) | Name, Notiz und gewählte Schriftrollen, Quellen, Familien, Kategorien, Links und Gewichte, einschließlich Hinzufügen/Entfernen von Mono. Reine Katalogsuche und Vorschau sind keine gespeicherten Pairing-Daten. |
| [KitNotes](../../apps/web/src/components/brand-kits/kit-details.tsx) | Geänderte Hinweise separat vom Color Scheme. |
| [KitDesignBriefing](../../apps/web/src/components/brand-kits/kit-design-briefing.tsx), [MarkdownEditor](../../apps/web/src/components/markdown-editor.tsx) | Getippter Text, Vorlage und neu erzeugter KI-Entwurf; auch bei geschlossenem Panel. Edit-/Vorschaumodus ist keine Änderung. Bestehende Navigation-/Unload-Sicherung mit dem gemeinsamen Wechsel abstimmen. |
| [KitTypography](../../apps/web/src/components/brand-kits/kit-typography.tsx), [Brand-Kit-Seite](../../apps/web/src/routes/_library/brand-kits.$slug.tsx) | Noch nicht gespeicherte Typografie und noch nicht übernommene direkte Schrift-Auswahl im Dialog. Serverseitig gespeicherte Typografie bleibt unverändert. |
| [SaveDialog](../../apps/web/src/components/brand-kits/save-dialog.tsx) | Noch nicht eingereichter Name und Projekt für ein neues Brand Kit; läuft Speichern, kurzzeitig blockieren. |
| [GeneratorWorkspace](../../apps/web/src/components/generator/generator-workspace.tsx) | Aktueller Color-Scheme-/Pool-Zustand wird bereits in der URL serialisiert und bleibt bei gleicher URL erhalten. Vor dem Wechsel ausstehende URL-Synchronisierung abschließen, damit die Query wirklich den aktuellen Stand enthält. Noch nicht übernommene lokale Farbtexte/-namen im Picker warnen. Undo-Verlauf, Hover und Vorschau dürfen zurückgesetzt werden. |
| [Einstellungen](../../apps/web/src/routes/_library/einstellungen.tsx) | Noch nicht abgesendeter Tokenname und geänderte Gültigkeit. Während Erstellung/Widerruf blockieren. Der neu ausgegebene Klartext-Token braucht den oben genannten separaten Schutz bis "Fertig". |
| [Anmeldung](../../apps/web/src/routes/anmelden.tsx) | Keine Texteingaben, nur GitHub OAuth. Vor Start sauber wechseln, bei laufendem OAuth-Start vorübergehend blockieren. `next` einschließlich kodierter Query beim Sprachwechsel erhalten. |

Sofort gespeicherte Status-, Favoriten- und Sammlungszuordnungs-Aktionen sind nach Erfolg sauber. Ihre noch laufenden Mutationen blockieren den Reload bis zur Antwort. URL-basierte Galerie-Filter und Suchen bleiben über die aktuelle URL erhalten und erzeugen keine zusätzliche Warnung. Die getrennte DE/EN-Auswahl der KI-Analyse ist reine Ansichtsauswahl; nach Reload startet sie entsprechend der neuen UI-Sprache. Eigentümer-Inhalte und vorhandene KI-Texte werden nicht umgeschrieben.

### Wichtige Abgrenzung bei Uploads und URL-Zustand

Der Demo-Job `Upload-Nachverarbeitung` bezeichnet ausschließlich bereits serverseitig angenommene Arbeit. Er behauptet keine bestehende dauerhafte Browser-Upload-Queue. Die tatsächliche Dateiübertragung in `QuickAdd.uploadAll()` ist eine browsergebundene Schleife und wird durch den kurzzeitigen Blocker geschützt. Nach der Antwort von [`createImageReference()`](../../apps/web/src/server/library.server.ts) ist die Referenz bereits gespeichert; optionale KI-Analyse- und Embedding-Jobs sind serverseitig angelegt. Diese vorhandene Hintergrundarbeit darf weiterlaufen. Ein neuer Upload-Job ist dafür nicht nötig. Der angenommene URL-Import ist ebenfalls serverseitig unabhängig.

Ebenso bedeutet "Verwerfen" den Verlust lokaler Eingaben, die der Reload nicht wiederherstellt. Bereits in der unverändert erhaltenen URL kodierte Color-Scheme-Werte bleiben weiterhin ungespeichert, sind aber wiederherstellbar. Bei ausschließlich solchen Werten erscheint keine Verlustwarnung. Diese Ausnahme verhindert, dass die Warnung einen Verlust verspricht, der gar nicht eintritt.

## Geführte Fälle und Nachweise

| Fall im Prototyp | Erwartung am Ende |
| --- | --- |
| Aktive Sprache | Änderungen bleiben, 0 Cookie-Schreibvorgänge und 0 Reloads. |
| Sauber wechseln | Deutsch, 1 Cookie-Schreibvorgang und 1 Reload. Erneutes Deutsch bleibt No-op. |
| Abbrechen | Englisch, Eingaben erhalten, Auswahl Englisch, 0 Reloads. |
| Verwerfen | Hinweise und Briefing zurück auf gespeicherter Basis, Deutsch, genau 1 Reload trotz zweiter Bestätigung. |
| Wieder sauber | Originalwert wieder eingesetzt, keine Warnung, 1 Reload. |
| KI-Entwurf | Englischer Entwurf sofort ungespeichert, auch nach Panel-Schließen; Abbruch erhält ihn, spätere Bestätigung verwirft ihn. |
| Speichern läuft | Wechsel blockiert ohne Vormerkung; nach Erfolg und neuer Auswahl 1 Reload mit neuer gespeicherter Basis. |
| Speicherfehler | Text bleibt ungespeichert; nächste Auswahl warnt, Abbruch erhält Text. |
| Import läuft | Gleiche Job-ID, Fortschritt bleibt beim Wechsel 35 %, danach 70 %. |
| Datei-Upload | Wechsel während Übertragung blockiert, nach Annahme erlaubt; gleicher angenommener Job läuft danach bis 70 % weiter. |
| KI läuft | Wechsel bis Antwort blockiert; danach schützt Warnung den neuen Entwurf, Abbruch erhält ihn. |

Ausgeführt auf Node `v26.12.1`: einmalige Inline-Smoke-Prüfung mit `node --input-type=module`, Exit 0. Beide Script-Blöcke parsen; alle elf Fälle laufen durch. Dabei geprüft: unveränderte URL bei jedem Schritt, Cookie-Schreibzahl gleich Reload-Zahl, höchstens ein Reload pro Aktion, unveränderte Werte bei Abbruch und kein vorgemerkter Wechsel bei laufenden Vorgängen. Zusätzliche Fälle prüfen Abbruch von Deutsch nach Englisch mit bestehendem Cookie, Einstellungen-URL und Anmeldung mit verschachtelt kodiertem `next`. Keine neue Testsuite angelegt. Ein erster Smoke-Aufruf endete mit Exit 1 durch den Vergleich von Arrays aus zwei JS-Kontexten; die Korrektur betraf nur den einmaligen Prüfaufruf, nicht das Modell.

T3 `html_preview` rendert die eigenständige Datei auf 728 und 390 px Breite ohne Konsolenfehler. Im T3-Browser wurden alle elf Führungen mit insgesamt 46 Aktionen über ihre DOM-Buttons inklusive echter modaler Warnung durchgeklickt. Kein festhängender Schritt. Der erste Fokus im Dialog liegt auf Abbrechen, danach wieder auf der Sprachauswahl. Der Desktop-Lauf hatte keinen horizontalen Überlauf. Die mobile Standansicht wurde visuell geprüft; eine interaktive Mobile-Prüfung ist nicht belegt: `preview_resize` meldete zwar die Einstellung 390 × 844, die tatsächliche Browserbreite blieb aber 1280 px. `html_render` zeigt die lauffähige Datei im Child-Thread. Der Koordinator muss dieselbe Datei im Parent-Thread erneut rendern, damit sie dort sichtbar ist.

Der einmal ausgeführte Impeccable-Detector meldete Exit 2 wegen eines zu kleinen Abstands der Schriftgrößen. `h2` wurde daraufhin von 18,4 auf 20 px erhöht. Keine Produktänderung und kein Nebenbefund im App-Code daraus abgeleitet.

## Grenzen und Übergabe

- Der Prototyp simuliert Cookie, Reload und Hintergrundarbeit ausschließlich im Speicher. Er weist keine tatsächliche Fortsetzung eines Uploads, SSR, Cookie-Attribute oder Paraglide-Integration nach.
- Die Felder stehen stellvertretend für lokale Formulare. Anmeldung und Einstellungen im freien Spiel wechseln nur den simulierten URL-Kontext; sie bilden die echten Ansichten nicht nach. Token-Ausgabe, mehrere gleichzeitige Formulare, URL-Synchronisierung und reale Overlay-Anordnung sind hier nicht nachgebaut.
- Der Demo-Editor sperrt Eingaben während laufender Vorgänge. Die spätere Umsetzung muss beim Speichern jede tatsächliche Editor-Semantik berücksichtigen und die bestätigte Basis korrekt übernehmen.
- Vorhandener Text wird durch die explizite Aktion "KI-Entwurf starten" in der Demo ohne eigene Ersetzen-Warnung ersetzt. Die bestehende Ersetzen-Warnung der App gehört weiter zum Briefing-Flow; hier wird ihre Bestätigung vorausgesetzt.
- Kein persistierendes Entwurfssystem, kein Autosave, keine App-Migration, keine Änderung von Quellen, Lockfiles oder Scripts. Keine Vollsuite, kein projektweiter Typecheck und kein Build für diesen Planungsauftrag. Der Koordinator verantwortet Spec-Review und gemeinsame CI.
- Die technische Paraglide-Spike-Entscheidung bleibt unabhängig. Der noch fehlende Node-24-CI-Nachweis ist eine spätere Implementierungsprüfung.

Für die Spec sind besonders der gemeinsame Verlustschutz, die temporären Blocker, die erreichbare Auswahl in modalen Editoren, die Ausnahme für URL-kodierten Zustand und der einmal sichtbare Token aufzunehmen. Der Link auf diesen festen Prototype-Commit bleibt als Primärquelle erhalten; die HTML-Datei selbst wird nicht in den Dokumentations-PR übernommen.
