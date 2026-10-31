# Backup und Wiederherstellung

Datenbank und Bilder werden jede Nacht verschlüsselt nach Cloudflare R2 gesichert. R2 liegt außerhalb von Railway, das Passwort im eigenen Passwortmanager. Ein verlorenes Railway-Konto kostet deshalb keine Daten.

## Überblick

| Was | Wie |
|---|---|
| Dienst | Railway-Cron-Dienst `backup` im eigenen App-Projekt, Image aus `ops/backup/Dockerfile` |
| Zeit | `0 2 * * *` (UTC), also 4 Uhr deutscher Sommerzeit, 3 Uhr Winterzeit |
| Datenbank | `pg_dump` 18, Custom-Format, unkomprimiert. restic komprimiert selbst und erkennt so unveränderte Teile. |
| Bilder | vollständige Kopie des Railway-Buckets mit `rclone` |
| Ziel | ein [restic](https://restic.net)-Repository im R2-Bucket, clientseitig verschlüsselt (AES-256) mit `RESTIC_PASSWORD` |
| Aufbewahrung | 7 tägliche, 4 wöchentliche, 12 monatliche Snapshots |
| Prüfung | jede Nacht `restic check` mit einem Siebtel der Daten, also einmal pro Woche das ganze Repository |

Dateien in `ops/backup/`:

- `backup.sh`: der nächtliche Lauf, Standardbefehl des Images
- `restore.sh`: Wiederherstellung in eine leere Datenbank und einen leeren Bucket
- `common.sh`: gemeinsame Hilfsfunktionen
- `restore-test.sh`: kompletter Test mit Wegwerf-Containern, siehe unten

### Ein Lauf

Jede Nacht entsteht ein Snapshot mit zwei Ordnern: `db/inspo.dump` und `bucket/` mit allen Objekten unter ihrem Schlüssel. restic lädt nur Teile hoch, die es noch nicht kennt. Danach laufen `forget --prune` mit der Aufbewahrungsregel und `check`. Der Dienst beendet sich danach; Railway startet ihn in der nächsten Nacht neu.

Das Log enthält pro Schritt nur Status, Dauer und Größen. Ausgaben von `pg_dump`, `rclone` und `restic` landen in einer temporären Datei. Bei einem Fehler erscheinen davon nur Verbindungs- und Repository-Fehler, nie Objektnamen, Zeileninhalte oder Zugangsdaten. Ein Lauf aus dem Wiederherstellungstest:

```
2026-09-24T16:08:27Z status=started
2026-09-24T16:08:27Z step=wait-for-database status=ok duration=0s
2026-09-24T16:08:27Z step=dump status=ok duration=0s size=375.2KiB
2026-09-24T16:08:27Z step=bucket status=ok duration=0s objects=117 size=49.8MiB
2026-09-24T16:08:28Z step=repository status=ok duration=1s repository=existing
2026-09-24T16:08:29Z step=snapshot status=ok duration=1s snapshot=6c9d44ca files_new=0 files_changed=118 added=184.3KiB
2026-09-24T16:08:31Z step=retention status=ok duration=2s snapshots=2 repository=51.1MiB
2026-09-24T16:08:32Z step=check status=ok duration=1s
2026-09-24T16:08:32Z status=ok duration=5s
```

`files_changed` zählt jede Nacht alle Dateien, weil der Container sie frisch lädt. Entscheidend ist `added`: Das ist, was wirklich neu nach R2 geht.

Ein Fehler endet mit `status=failed` und Exit-Code 1, fehlende Variablen mit Exit-Code 2, zum Beispiel:

```
2026-09-24T16:09:56Z step=dump status=failed exit=1 duration=0s
  pg_dump: error: connection to server at "…" failed: FATAL:  password authentication failed for user "postgres"
2026-09-24T16:09:56Z status=failed duration=0s
```

### Grenzen

- **Kein gemeinsamer Zeitpunkt.** Erst läuft der Dump, dann die Bucket-Kopie. Löscht jemand genau dazwischen eine Referenz, fehlen im Snapshot ihre Bilder, die Zeile ist aber da. Nachts um vier mit einer Person ist das praktisch ausgeschlossen.
- **Volle Kopie jede Nacht.** Der Dienst lädt jede Nacht den ganzen Bucket aus Railway. Bei einigen GB ist das egal. Wird der Bucket sehr groß, hilft ein Volume für `/backup`, dann kopiert `rclone sync` nur Änderungen.
- **Postgres-Version.** `pg_dump` 18 sichert Server bis Version 18. Zieht Railway auf Postgres 19 um, schlägt der Dump laut fehl; dann im Dockerfile `postgres:19-alpine` eintragen.

## Aufbewahrung

Regel: `--keep-daily 7 --keep-weekly 4 --keep-monthly 12`. Gezählt werden Tage, Wochen und Monate, in denen es einen Snapshot gibt, nicht Kalendertage.

Begründung:

- **7 tägliche.** Ein Fehler der letzten Woche (versehentlich gelöscht, kaputter Import, fehlerhafte Migration) lässt sich tagesgenau zurückholen.
- **4 wöchentliche.** Fehler, die erst nach ein paar Wochen auffallen, etwa fehlende Bilder in einer selten geöffneten Sammlung.
- **12 monatliche.** Deckt den Verlust des Railway-Kontos und schleichende Fehler über ein Jahr ab. Länger bringt für eine persönliche Bibliothek wenig und hält gelöschte Daten unnötig lange fest.
- **Kosten.** restic speichert gleiche Teile nur einmal. Die Bibliothek plus Änderungen eines Jahres bleibt bei einigen GB, das liegt im kostenlosen R2-Kontingent von 10 GB-Monat. Download ist bei R2 immer kostenlos, Speicher darüber kostet 0,015 US-Dollar pro GB und Monat.

Es gibt höchstens 23 Snapshots, meist weniger, weil sich Tage, Wochen und Monate überschneiden.

## Wie lange gelöschte Einträge in Backups bleiben

Wird eine Referenz gelöscht, entfernt die App die Zeilen (Aufnahmen, Analysen, Embeddings und Sammlungszuordnungen per Cascade) und die Bilder im Bucket. Ab dem nächsten nächtlichen Snapshot ist sie nicht mehr enthalten. Ältere Snapshots enthalten sie noch, bis die Aufbewahrungsregel sie entfernt. `prune` löscht die Daten in derselben Nacht auch physisch aus R2.

**Antwort auf einen Löschwunsch: Ein gelöschter Eintrag ist nach spätestens rund 11 Monaten aus allen Backups verschwunden, immer mit dem ersten Lauf eines Monats. Eine sichere Zusage lautet "innerhalb von 12 Monaten".**

Am längsten hält sich der Monats-Snapshot. Von jedem Monat bleibt der letzte Snapshot, bis 12 neuere Monate Snapshots haben. Ein Eintrag steckt im Monats-Snapshot des Vormonats, und wenn er erst am Monatsletzten nach dem Lauf gelöscht wurde, auch in dem des Löschmonats. Eine Simulation mit echten restic-Läufen (520 Nächte mit gesetztem Datum, jede Nacht `forget` mit derselben Regel) ergab:

| Gelöscht am (nach dem nächtlichen Lauf) | Aus allen Snapshots verschwunden am | Dauer |
|---|---|---|
| 01.03.2025 | 01.02.2026 | 337 Tage |
| 15.03.2025 | 01.02.2026 | 323 Tage |
| 31.03.2025 | 01.03.2026 | 335 Tage |

Sonderfälle:

- **Im ersten Jahr** hält restic zusätzlich den allerersten Snapshot, solange es noch keine 12 Monate mit Snapshots gibt. Was beim ersten Backup schon da war, bleibt deshalb bis zu 12 Monate nach dem ersten Lauf erhalten.
- **Fällt das Backup aus**, wird auch nichts entfernt. Die Regel zählt vorhandene Snapshots, keine Kalendertage.
- **Sofort entfernen**, wenn ein Löschwunsch nicht warten kann:
  - Bilder: `restic rewrite --exclude /bucket/references/<id> --forget` für alle Snapshots, danach `restic prune`.
  - Datenbankzeilen stecken im Dump jedes Snapshots und lassen sich nicht einzeln entfernen. Dann alle Snapshots vor dem Löschtag mit `restic forget <snapshot-ids> --prune` entfernen. Das kostet den Rückgriff auf ältere Stände.
- **Railway selbst** hält eigene Backups des Postgres-Volumes, falls sie aktiv sind, mit eigener Aufbewahrung. Die liegen außerhalb dieser Regel, nachsehen unter Dienst `pgvector` → Backups.

## Einrichtung (einmalig)

### Cloudflare R2

1. Im Cloudflare-Dashboard R2 öffnen und einen Bucket `inspo-backup` anlegen. Empfehlung: Jurisdiction **EU**, dann bleiben die Daten garantiert in der EU. Das lässt sich später nicht ändern.
2. Unter R2 → "Manage API tokens" einen Token anlegen: Berechtigung **Object Read & Write**, nur für den Bucket `inspo-backup`. Access Key ID und Secret Access Key notieren, Cloudflare zeigt sie nur einmal.
3. Die Account-ID steht in der R2-Übersicht. Daraus wird die Repository-Adresse:
   - Jurisdiction EU: `s3:https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com/inspo-backup`
   - ohne Jurisdiction: `s3:https://<ACCOUNT_ID>.r2.cloudflarestorage.com/inspo-backup`
4. Ein Repository-Passwort erzeugen, z. B. `openssl rand -base64 32`, und **außerhalb von Railway** im Passwortmanager ablegen, zusammen mit Repository-Adresse und R2-Schlüsseln. Ohne dieses Passwort ist das Backup wertlos, niemand kann es entschlüsseln.
5. Optional, empfohlen: auf healthchecks.io einen Check "inspo backup" anlegen, Zeitraum 1 Tag, Karenz 2 Stunden. Dessen URL wird `BACKUP_PING_URL`. Dann kommt eine Mail, wenn ein Lauf fehlschlägt oder gar nicht erst startet.

### Railway, Projekt `inspo`

1. "New" → "GitHub Repo" → das eigene Repository, den Dienst `backup` nennen.
2. Settings:
   - **Root Directory:** `/ops/backup`. Railway findet dort das `Dockerfile`, der Build-Kontext ist nur dieser Ordner.
   - **Watch Paths:** `/ops/backup/**`. Änderungen an der Web-App bauen den Dienst dann nicht neu. Watch Paths gelten ab Repo-Wurzel, auch mit Root Directory.
   - **Cron Schedule:** `0 2 * * *`
   - **Restart Policy:** Never. Ein fehlgeschlagener Lauf soll nicht in Schleife neu starten; der nächste kommt in der nächsten Nacht.
   - Keine Domain, kein Volume, gleiche Region wie `pgvector`.
3. Variables (Raw Editor). Die `S3_*`-Zeilen genauso wie beim Dienst `web` eintragen; heißt der Bucket-Dienst anders als `bucket`, den Namen anpassen:

   ```
   DATABASE_URL=${{pgvector.DATABASE_URL}}
   S3_BUCKET=${{bucket.BUCKET}}
   S3_ENDPOINT=${{bucket.ENDPOINT}}
   S3_REGION=${{bucket.REGION}}
   S3_ACCESS_KEY_ID=${{bucket.ACCESS_KEY_ID}}
   S3_SECRET_ACCESS_KEY=${{bucket.SECRET_ACCESS_KEY}}
   RESTIC_REPOSITORY=s3:https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com/inspo-backup
   RESTIC_PASSWORD=<Repository-Passwort>
   AWS_ACCESS_KEY_ID=<R2 Access Key ID>
   AWS_SECRET_ACCESS_KEY=<R2 Secret Access Key>
   AWS_DEFAULT_REGION=auto
   BACKUP_PING_URL=<optional, healthchecks.io-URL>
   ```

   `DATABASE_URL` zeigt auf die private Adresse im Railway-Netz, der Dump verursacht also keinen öffentlichen Traffic. Hat `web` zusätzlich `S3_FORCE_PATH_STYLE=1`, auch hier setzen.
4. Deployen. Den ersten Lauf nicht bis zur Nacht abwarten: Cron Schedule kurz auf `*/5 * * * *` setzen, den Lauf abwarten, dann zurück auf `0 2 * * *`.
5. Im Log des ersten Laufs steht `repository=created`, restic legt das Repository selbst an. Ab dann steht dort `repository=existing`. Endet der Lauf mit `status=ok`, einmal die Wiederherstellung unten mit dem echten Repository in eine lokale Datenbank durchspielen, wie in Phase 4 des Umsetzungsplans vorgesehen.

## Wiederherstellung

Gebraucht werden Docker, ein Checkout dieses Repos und die Werte aus dem Passwortmanager. Das Ziel muss leer sein; `restore.sh` bricht sonst ab.

1. **Leeres Ziel bereitstellen.**
   - Datenbank: Postgres 18 oder neuer mit pgvector, z. B. ein neuer Railway-Dienst aus dem pgvector-Template oder lokal:
     `docker run -d --name inspo-restore-pg -e POSTGRES_PASSWORD=<pw> -p 127.0.0.1:54340:5432 pgvector/pgvector:pg18`
     Die lokale Entwicklungsdatenbank aus `compose.yaml` ist Postgres 17 und taugt nicht als Ziel.
   - Bucket: ein leerer S3-Bucket, z. B. ein neuer Railway-Bucket. Für eine lokale Kopie ist kein Bucket nötig, siehe Schritt 4.
2. **Image bauen:** `docker build -t inspo-backup ops/backup`
3. **`restore.env` anlegen** (`chmod 600`, nie committen):

   ```
   RESTIC_REPOSITORY=s3:https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com/inspo-backup
   RESTIC_PASSWORD=<Repository-Passwort>
   AWS_ACCESS_KEY_ID=<R2 Access Key ID>
   AWS_SECRET_ACCESS_KEY=<R2 Secret Access Key>
   AWS_DEFAULT_REGION=auto
   # SNAPSHOT=<id>   ohne Angabe: der neueste
   TARGET_DATABASE_URL=postgres://postgres:<pw>@host.docker.internal:54340/postgres
   TARGET_S3_BUCKET=<name>
   TARGET_S3_ENDPOINT=<endpoint>
   TARGET_S3_REGION=<region>
   TARGET_S3_ACCESS_KEY_ID=<key>
   TARGET_S3_SECRET_ACCESS_KEY=<secret>
   ```

   Fehlt `TARGET_DATABASE_URL` oder `TARGET_S3_BUCKET`, überspringt `restore.sh` diesen Teil.
4. **Zurückspielen:**

   ```sh
   mkdir -p restore
   docker run --rm --env-file restore.env --add-host host.docker.internal:host-gateway \
     --user "$(id -u)" -v "$PWD/restore:/restore" inspo-backup restore.sh
   ```

   `restore.sh` holt den Snapshot nach `/restore` (dank `-v` bleibt er in `./restore`), spielt den Dump mit `pg_restore --no-owner --no-privileges --single-transaction` ein, kopiert die Objekte in den Ziel-Bucket und vergleicht danach Größe und Prüfsumme jedes Objekts (`rclone check`). Ohne Bucket liegen die Bilder in `./restore/bucket`; die Web-App kann sie lokal direkt mit `STORAGE_DIR=<Pfad>/restore/bucket` lesen.
5. **Web-App umstellen:** `DATABASE_URL` und `S3_*` auf das neue Ziel setzen. Nicht im Backup sind die Umgebungsvariablen: `BETTER_AUTH_SECRET`, GitHub-OAuth-App, `OWNER_GITHUB_ID`, `WORKER_TOKEN`, `ANTHROPIC_API_KEY`, `EMBEDDINGS_API_KEY`. Die gehören in den Passwortmanager. Ein neues `BETTER_AUTH_SECRET` meldet nur alle Sitzungen ab. MCP-Tokens gelten weiter, ihre Hashes liegen in der Datenbank.

Weitere Befehle, jeweils `docker run --rm --env-file restore.env inspo-backup restic …`:

- `restic snapshots`: alle Snapshots mit ID und Datum
- `restic ls latest /bucket/references/<id>`: was ein Snapshot zu einer Referenz enthält
- `restic restore <id> --target /restore --include /bucket/references/<id>`: nur einzelne Bilder (mit `-v "$PWD/restore:/restore"`)

## Wiederherstellungstest

`ops/backup/restore-test.sh` spielt den ganzen Weg mit Wegwerf-Containern durch. Die Container tragen das Präfix `inspo18-rt-` und verschwinden danach wieder, Dev-Datenbank und Produktion bleiben unberührt. Das Skript braucht Docker, den installierten Workspace (`pnpm install`) und `openssl`.

1. Postgres 18 mit pgvector; Datenbank `source` mit den Drizzle-Migrationen und Testdaten (Referenzen, Aufnahmen, Analysen, Embeddings, Sammlungen). Ein S3-Ersatz (`rclone serve s3`) spielt Railway-Bucket, R2 und Ziel-Bucket; pro Aufnahme ein Zufallsobjekt, dazu ein Upload mit 25 MB.
2. `backup.sh`, dann eine Referenz samt Bildern löschen, `backup.sh` erneut.
3. `restore.sh` des neuesten Snapshots in die leere Datenbank `restored` und den leeren Bucket `restored`.
4. Prüfung: Zeilenzahl und Inhalts-Hash jeder Tabelle, SHA-256 jedes Objekts, die gelöschte Referenz fehlt im neuesten Snapshot und steckt noch im ersten, die Backup-Logs enthalten weder Objektnamen noch Zeileninhalte noch Passwörter.

Ergebnis am 2026-09-24 (30 Referenzen, `ops/backup/restore-test.sh`):

```
ok    13 tables, 178 rows: counts and content hashes match
ok    117 objects (49.7 MiB): SHA-256 of every object matches
ok    deleted reference is absent after the restore
ok    deleted objects: 6 in the first snapshot, 0 in the latest (2 snapshots)
ok    backup logs name no object, row or secret
Durations: backup 1 7s, backup 2 5s, restore 2s (including container start)
```

Erneut laufen lassen nach Änderungen in `ops/backup/`, nach Schema-Migrationen mit neuen Datentypen oder Erweiterungen und sonst einmal im Quartal, dann zusätzlich einmal mit dem echten R2-Repository in eine lokale Datenbank wie im Abschnitt Wiederherstellung.
