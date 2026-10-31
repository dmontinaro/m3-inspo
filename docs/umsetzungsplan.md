# Vorbereitung der Open-Source-Veröffentlichung

Ziel ist eine selbst hostbare Anwendung namens **m3 inspo**, lizenziert unter MIT, mit einem Eigentümer pro Installation. Die Architektur steht in [spec.md](spec.md), die Installation in der [README](../README.md).

## Bereinigter Quellstand

- Eigene Paketnamen unter `@m3-inspo/*` und eigenes Produktbranding.
- Private Projektbriefings, persönliche Beispiele und interne Tracker-Links aus dem verteilten Quellstand entfernen.
- Herkunftshinweise in `LICENSE-INSPO`, `THIRD_PARTY_NOTICES.md` und den betroffenen Dateien erhalten.
- Bestehende `INSPO_*`-Konfiguration, Tokens und gespeicherte Daten kompatibel halten.
- Installation, externe Datenflüsse, Worker-Isolation und Backup erklären.

## Vor dem öffentlichen Start

1. Typecheck, Lint und Tests am finalen Stand erfolgreich ausführen. Einen frischen Installationsweg einschließlich OAuth und URL-Capture prüfen.
2. Den finalen Snapshot mit einem Secret-Scanner prüfen. `.env`, private Briefings, Dumps, Screenshots und lokale Prüfartefakte bleiben außerhalb des veröffentlichten Baums. Die Git-Historie ist dadurch nicht bereinigt.
3. Abhängigkeitslizenzen für alle ausgelieferten Plattformen und Container prüfen. Bei Binärpaketen besonders die enthaltenen Fremdbibliotheken und Quellcode-Angebote beachten.
4. Nach Freigabe ein neues öffentliches Repository mit einem neuen ersten Commit aus dem geprüften Snapshot erstellen. Keinen normalen Push dieses privaten Branches und keinen Mirror verwenden, da das die private Historie übertragen würde.
5. GitHub-Zugriffsregeln, private Security-Meldungen und CI im neuen Repository einrichten. Ein öffentlicher Quellcode erfordert keine öffentliche Datenbank oder Bibliothek.

Ein Quellarchiv lässt sich nach dem Commit mit `git archive --format=tar HEAD` erzeugen. Es enthält ausschließlich den committed Stand, weder `.git` noch ignorierte lokale Dateien. Das Archiv vor dem Import in das neue Repository prüfen.

## Weiterentwicklung

Die öffentliche Codebasis wird die gemeinsame Entwicklungsbasis. Private Installationseinstellungen und Bibliotheksinhalte bleiben außerhalb des Repositorys. Zwei dauerhaft getrennte Produktbranches würden jede Änderung doppelt pflegebedürftig machen.

Ein Dienst für mehrere Nutzer oder eine frei zugängliche Bibliothek ist ein separates Vorhaben. Das aktuelle Datenmodell isoliert keine Nutzerbibliotheken.
