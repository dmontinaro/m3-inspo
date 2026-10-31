# Issue tracker

Use GitHub Issues for the repository configured as this checkout's origin. Resolve it with `gh repo view --json nameWithOwner,visibility` before writing. Do not assume that the private preparation repository and the public release repository are the same.

Create issues only when authorized. In particular, creating an issue in a public repository requires the user's explicit permission. Keep private content and credentials out of issues, comments and pull requests.

Use the `gh` CLI for reads and authorized writes. Read an issue's body, labels and comments before acting on it. GitHub shares one number space between issues and pull requests; resolve ambiguous numbers before editing.

When publishing a spec, add the `spec` label. Implementation tickets belong to the spec as native GitHub sub-issues. Record blocking dependencies through native issue dependencies where available.

External pull requests are reviewed as contributions; they do not automatically authorize issue creation or external messaging. The canonical triage labels are documented in `triage-labels.md`.
