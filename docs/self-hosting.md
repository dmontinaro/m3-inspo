# Self-hosting

m3 inspo runs as a Node.js web server, a Postgres database with pgvector, private image storage and a separate Playwright capture worker. Each installation belongs to one owner. Keep the GitHub owner restriction enabled, even when the server is reachable over the internet.

## Web server

Install with `pnpm install --frozen-lockfile`, apply the committed migrations with `pnpm --filter @m3-inspo/db db:migrate`, then build with `pnpm build`. Start from the repository root with:

```sh
pnpm --filter @m3-inspo/web start
```

The server entry point is `apps/web/.output/server/index.mjs`. Nitro starts the font metadata sync and any enabled AI and embedding jobs with the server. This needs a persistent Node.js process; a static host is insufficient.

Use `.env.example` as the configuration inventory. In production, set `INSPO_BASE_URL` and `BETTER_AUTH_URL` to the same HTTPS origin and register `<origin>/api/auth/callback/github` with GitHub. Give separate installations separate OAuth apps, secrets and storage.

Use either a persistent directory through `STORAGE_DIR` or an S3-compatible bucket. Keep the bucket private. Image requests are served through the app's authenticated asset route; workers upload through short-lived signed URLs. A local directory on ephemeral container storage will lose images on redeploy.

Postgres needs the pgvector extension. The application stores vectors with 1024 dimensions; a custom embedding model must match. Apply migrations before starting a new app version. Take backups before upgrades.

## Capture worker

The worker needs `INSPO_API_URL` pointing at the web app and the same `WORKER_TOKEN` as the app. It does not need the database URL, S3 credentials, OAuth secrets or AI keys. Keep it outside the app's private network and isolate it from private services and cloud metadata.

For local development the package's start script can read the repository `.env`. For a hosted worker, inject only the worker-specific settings and avoid mounting the web app's `.env`.

Build from the repository root:

```sh
docker build -f apps/worker/Dockerfile -t m3-inspo-worker .
```

The Dockerfile pins the Playwright image to the installed Playwright version and runs as a non-root user. Chromium's sandbox is enabled by default. Docker's default seccomp rules can prevent the user namespaces it needs; use a host-compatible seccomp profile allowing those namespaces, as described in the Dockerfile. Do not assume the container will capture pages successfully until you have imported a real public URL.

Set `CHROMIUM_SANDBOX=off` only on hosts that cannot support it, with the worker isolated as described above. The guarding proxy and a separate project are additional controls; they do not replace Chromium's sandbox. Give the worker more than 2 GB of memory and about 100 seconds to drain on shutdown.

`apps/worker/Dockerfile` documents the Railway-specific settings. Other hosts can run the same image and API protocol. The code does not require a Railway account. On Railway, use a separate worker project and set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=100`.

## External services and data

- **Anthropic**, when `ANTHROPIC_API_KEY` is set: analysis sends screenshots plus title, URL, focus and take/avoid notes. Briefing generation sends the kit's colors, typography, notes and selected references' text. Images are not sent for briefing generation.
- **Embedding endpoint**, when `EMBEDDINGS_API_KEY` is set: sends text for references and search queries. The default endpoint is OpenRouter; `EMBEDDINGS_BASE_URL` can point at another compatible API. Pick a model producing 1024-dimensional vectors.
- **Fontsource**: the server refreshes public font metadata on startup when stale and then daily. Browser font previews load font files from jsDelivr. This is independent of the optional AI settings.
- **Adobe Fonts**, when configured: the app looks up selected font families and maintains a preview kit for the configured hostname. Browsers load the fonts through Adobe's CDN. Operators need their own subscription and permissions. The existing preview-kit name is retained for compatibility.
- **Referenced websites**: importing a URL or requesting a live design-system inspection contacts that site. The worker loads the public page and its resources; its network requests are checked by the public-address guard.
- **GitHub**: owner authentication uses GitHub OAuth. The database stores the resulting account and session information.

Disabling provider keys stops the optional AI, embedding and Adobe integrations. It does not make the entire app offline: font metadata, font CDN previews, OAuth and URL captures still use the network. Keep private project briefings and collected images in your installation's database and storage, not in source files.

## Existing installations

Keep existing environment-variable names, database names, token values and storage paths. No database migration is needed for the package rename or removal of bundled briefing suggestions. Saved kit briefings stay in the database. Older source-bundled suggestions are no longer distributed; paste any suggestions you want to keep into the appropriate kit's design briefing.

Compose project names determine volume names. If you already use Compose, keep your existing project name through `COMPOSE_PROJECT_NAME` or `docker compose -p <existing-project>`. Inspect `docker compose ls` and your existing volumes before starting a differently named project. A new project name creates a separate empty database volume.

## Backups

See [backup and restore](backup.md). Store encrypted backups outside the application provider and retain the encryption password separately. Test restoration into a disposable database and bucket before relying on the backup.
