# Contributing

Start with the [local setup](README.md#local-setup). Use pnpm and Node.js 24 or newer. The domain vocabulary is in [CONTEXT.md](CONTEXT.md), the architecture in [docs/spec.md](docs/spec.md).

Keep changes focused and describe the problem and resulting behavior in the pull request. Code, identifiers and commit messages are English. The web interface supports English and German; domain documentation is German.

Run `pnpm typecheck`, `pnpm lint` and the relevant tests. The full `pnpm test` suite needs Postgres with pgvector and Playwright Chromium. Tests create and drop their own isolated database; point `TEST_DATABASE_SERVER_URL` at a development server where creating databases is allowed.

Include a screenshot for visible changes. Use synthetic data or content you have permission to share. Keep credentials, database dumps, collected references and private project briefings outside tracked files.

Contributions are provided under this project's MIT license. Keep the third-party notices with derived code. Security reports follow [SECURITY.md](SECURITY.md).
