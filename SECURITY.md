# Security

m3 inspo is a private library for one owner per installation. Keep the owner gate enabled. Multi-user hosting requires a separate authorization and data-isolation design.

For a suspected vulnerability, use the repository's **Security → Report a vulnerability** form when available. If private reporting is unavailable, open an issue asking for a private contact without including exploit details, credentials or private content.

Operators should use HTTPS, private image storage and a capture worker isolated from databases and private services. Give the worker only its API origin and worker token. The [self-hosting guide](docs/self-hosting.md) covers the deployment boundary and browser sandbox requirements.

AI analysis and embeddings send reference content to the configured providers when enabled. See [data flows](docs/self-hosting.md#external-services-and-data).
