# The capture worker (docs/self-hosting.md): the official
# Playwright image, whose Chromium matches the installed playwright version,
# with only the worker and its workspace packages. Node runs the TypeScript
# sources directly (type stripping), so there is no build step.
#
# Build from the repository root (Dockerfile.dockerignore next to this file applies):
#   docker build -f apps/worker/Dockerfile -t m3-inspo-worker .
# Run with nothing but these two settings (no database or bucket credentials):
#   docker run --rm --security-opt seccomp=chromium-seccomp.json \
#     -e INSPO_API_URL=https://library.example.com -e WORKER_TOKEN=… m3-inspo-worker
#
# Chromium runs with its sandbox on, which needs unprivileged user namespaces.
# Docker's default seccomp profile refuses them (clone/unshare without
# CAP_SYS_ADMIN), so every capture then fails with "Chromium sandboxing
# failed". Run with a seccomp profile that allows them: Docker's default
# profile (github.com/moby/profiles, seccomp/default.json) plus one rule
#   { "names": ["clone", "clone3", "unshare", "setns"], "action": "SCMP_ACT_ALLOW" }
# (checked with Docker 29 on 2026-09-24). Playwright's own seccomp_profile.json
# (microsoft/playwright, utils/docker) is the documented alternative, but it
# no longer starts containers on Docker 29. The host kernel must allow user
# namespaces too. `--security-opt seccomp=unconfined` works for a local test
# only.
#
# Railway's containers refuse user namespaces and take no seccomp profile
# (checked 2026-09-24: "Chromium sandboxing failed!"). The `inspo-capture`
# project therefore sets CHROMIUM_SANDBOX=off; isolation there comes from the
# worker itself: own project without private network to the app, only its
# token, the guarding proxy, a non-root user, and GPU/3D off (src/capture.ts).
# Anywhere user namespaces work, leave the sandbox on.
#
# Give the container well over 2 GB of memory. Long pages peak near 1.7 GB
# (termius.com, 13,420 px: measured on Railway on 2026-09-24); at Railway's
# trial limit of 1 GB the kernel kills Chromium mid-screenshot.
#
# On SIGTERM the worker finishes its job (at most 90 s, src/main.ts). Give it
# that time before the kill: Railway's default is 0 s, so `inspo-capture` sets
# RAILWAY_DEPLOYMENT_DRAINING_SECONDS=100. Killed earlier, the job's lease
# runs out and it is handed out again after up to 5 minutes. (`railway
# restart` killed the container within ~10 s despite the setting, checked
# 2026-09-24; the job was handed out again as described.)

# Keep the tag equal to "playwright" in apps/worker/package.json (pinned exactly).
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/taxonomy/package.json packages/taxonomy/
RUN corepack install && pnpm install --frozen-lockfile --prod --filter "@m3-inspo/worker..."

COPY packages/shared/src packages/shared/src
COPY packages/taxonomy/src packages/taxonomy/src
COPY apps/worker/src apps/worker/src
COPY LICENSE LICENSE-INSPO LICENSE-MONA-SANS THIRD_PARTY_NOTICES.md ./

# Not root: Chromium runs with its sandbox on, as the image's unprivileged user.
USER pwuser
WORKDIR /app/apps/worker
CMD ["node", "src/main.ts"]
