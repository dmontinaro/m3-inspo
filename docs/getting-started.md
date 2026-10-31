# Get started

Run your own private m3 inspo library, then connect a coding agent over MCP. For production, continue with the [self-hosting guide](self-hosting.md).

## Local setup

You need Node.js 24 or newer, pnpm 11.5.3, Docker with Compose, and a GitHub account. Use your own GitHub OAuth app. API keys for AI, embeddings and Adobe Fonts are optional.

### 1. Install and configure

Clone this repository, then run from its root:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit `.env` and set:

- `BETTER_AUTH_SECRET`: at least 32 random characters. Generate it with `openssl rand -base64 32`.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: credentials from your GitHub OAuth app.
- `OWNER_GITHUB_ID`: your numeric GitHub user ID, not your username. If you use GitHub CLI, `gh api user --jq .id` prints it.
- `WORKER_TOKEN`: a separate random value of at least 32 characters, shared by the web app and worker.

In [GitHub developer settings](https://github.com/settings/developers), create an OAuth app with:

| Field | Local value |
| --- | --- |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/callback/github` |

Keep `INSPO_BASE_URL`, `BETTER_AUTH_URL` and `INSPO_API_URL` at `http://localhost:3000` for local development. `STORAGE_DIR=../../.storage` stores private images in the ignored repository-local folder. Leave optional provider keys empty to start without AI or Adobe Fonts.

### 2. Start Postgres and apply migrations

```sh
docker compose up -d --wait
pnpm --filter @m3-inspo/db db:migrate
```

Compose binds Postgres to `127.0.0.1:54330` and stores its data in a named volume. If that port is occupied, set `POSTGRES_PORT` in `.env` and update the port in `DATABASE_URL`. For tests using that port, also set `TEST_DATABASE_SERVER_URL` when invoking `pnpm test`.

### 3. Start the app and capture worker

In one terminal:

```sh
pnpm dev
```

In another terminal:

```sh
pnpm --filter @m3-inspo/worker playwright:install
pnpm --filter @m3-inspo/worker start
```

Open `http://localhost:3000`, sign in with the owner account, then add a screenshot or import a public URL. Review the reference and approve it to make it available to agents. Screenshots can be uploaded without a running worker; URL imports and captured font previews need it.

On Linux, Chromium may also need system libraries. Install them using `pnpm --filter @m3-inspo/worker exec playwright install --with-deps chromium` on a development machine where you manage those dependencies. Keep Chromium's sandbox enabled when the host supports it; see [self-hosting](self-hosting.md).

## Connect an MCP client

Sign in, open **Einstellungen**, and create a token. It is shown once. The page provides a command with your actual origin and token:

```sh
claude mcp add --transport http m3-inspo http://localhost:3000/api/mcp --header "Authorization: Bearer <your-token>"
```

Other HTTP MCP clients use the same URL and bearer header. Clients that cannot send `Authorization` can use `x-api-key` instead. Expired or revoked tokens are refused. Agents receive approved references and kits only, including your notes and inline images.

The existing `INSPO_*` environment variables and `inspo_mcp_` token prefix remain supported. The package rename does not require replacing existing credentials or renaming databases. To keep an existing client's configuration, leave its local server alias as it is.

[Back to the README](../README.md)
