# m3 inspo

Self-hosted design library for one owner and their coding agents. Architecture: `docs/spec.md`. Release preparation: `docs/umsetzungsplan.md`.

- Use pnpm. CI checks types, lint and tests with Postgres and Chromium on pull requests. The README documents local prerequisites.
- Code, identifiers and commit messages are English. The current interface and domain documentation are German.
- Keep library data, credentials and project-specific briefings outside tracked source. `.private/` is ignored local material and must stay out of releases.
- Preserve third-party notices when moving derived code. See `THIRD_PARTY_NOTICES.md` and `LICENSE-INSPO`.
- Preserve existing `INSPO_*` configuration and token compatibility when changing product names.

## Repo guidance

- Before working with issues or specs in a tracker, read `docs/agents/issue-tracker.md`.
- For triage, use the canonical labels in `docs/agents/triage-labels.md`.
- For domain terminology or architecture decisions, read `CONTEXT.md` and `docs/agents/domain.md`.
