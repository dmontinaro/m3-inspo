# m3 inspo

### Your taste. In your agent's context.

A private taste library for the things you want to build. Save design references, write down what works, and give your coding agents access through MCP.

**Self-hosted · One owner · Approved references only · MIT**

[Get started](#local-setup) · [Connect your agent](#connect-your-agent) · [Self-hosting](docs/self-hosting.md) · [Contributing](CONTRIBUTING.md)

![m3 inspo gallery with six design references, project tags and favorites](docs/images/taste-library.png)

*Your references, organized by the way you think about design. App screenshots use fictional projects and original demo artwork. The current interface is German.*

## Give your agent a sense of your taste

You save a hotel homepage for its typography. A product screen for its spacing. A booking flow for the way it makes the next step obvious. The useful part is knowing **why you saved each one**.

m3 inspo keeps that judgment beside the image. "Take the generous spacing and warm palette. Avoid the rotating hero and urgency banners." When an agent retrieves the reference, it gets your notes with it.

Your library grows across projects. You can reuse a reference, organize it into collections, or tag it for a specific project without explaining the same preferences in every new conversation.

## Collect → curate → approve → build

1. **Collect** a public URL or upload a screenshot. Keep desktop and mobile references together in your library.
2. **Curate** what to take and what to avoid. Add tags, favorites and collections. Mark a region when one part of a screen matters.
3. **Approve** the references and brand kits you want agents to use. Drafts and archived items stay out of MCP results.
4. **Build** with an MCP-connected agent that can retrieve the images, notes and brand decisions relevant to the task.

![Reference detail with an approved Harbor design and the owner's take and avoid notes beside the image](docs/images/reference-notes.png)

*The screenshot shows the design. Your notes tell the agent which decisions matter.*

## Connect your agent

MCP, the Model Context Protocol, lets a coding agent query your library while it works. Your client connects to your own instance with a revocable token.

Create a token under **Einstellungen**, then add it to Claude Code:

```sh
claude mcp add --transport http m3-inspo http://localhost:3000/api/mcp --header "Authorization: Bearer <your-token>"
```

Other HTTP MCP clients can use the same endpoint and bearer header. See [client setup](docs/getting-started.md#connect-an-mcp-client) for details.

Then give your agent a task like this:

> Build the booking page for Harbor. Use m3 inspo to find references
> for a calm, editorial hero. Read my take and avoid notes, use the
> approved Harbor brand kit, and explain which decisions you carry
> into the implementation.

The agent can use these tools to gather context before writing code:

| Tool | What it brings into the conversation |
| --- | --- |
| `recommend` | References ranked for a design brief |
| `search_screens` | References filtered by project, collection or design attributes |
| `get_screen` | A reference's image, your notes and available analysis |
| `find_components` | Marked regions and references for a specific component |
| `get_brand_kit` | Approved colors, typography, CSS and a brand's design briefing |

Image display depends on the MCP client's support for image responses. The agent writes the implementation in your project using the context it retrieves.

## Keep a brand's decisions together

Save color schemes, typography pairings and a Markdown design briefing in a brand kit. Approve a kit for a project so your agent can retrieve the saved choices while using other references for layout and composition.

The color generator includes color scales, light and dark roles, contrast checks and CSS exports for CSS variables or Tailwind v4. Design briefings can also be exported as `DESIGN.md`.

![Harbor brand kit with forest green, cream and sand colors, usage notes and a CSS export](docs/images/brand-kit.png)

## Your own library, on your own instance

Each installation has one owner, authenticated through GitHub. The library is private, and agents need a token to read approved content. You decide where to host the app, database and images.

Upload, capture, curation and text search work without AI keys. Optional AI analysis and semantic search add generated descriptions, tags and ranking. When enabled, these services send content to their configured providers. [Read about external services and data](docs/self-hosting.md#external-services-and-data).

## Local setup

You need **Node.js 24+**, **pnpm 11.5.3**, **Docker with Compose** and your own **GitHub OAuth app**.

```sh
git clone https://github.com/dmontinaro/m3-inspo.git
cd m3-inspo
pnpm install --frozen-lockfile
cp .env.example .env
```

Follow the [setup guide](docs/getting-started.md) to configure owner access, start Postgres, apply migrations and run the app and capture worker. For a hosted installation, use the [self-hosting guide](docs/self-hosting.md).

## Optional services and data

| Capability | Configuration | Without it |
| --- | --- | --- |
| AI image analysis and briefing drafts | `ANTHROPIC_API_KEY`, optionally `ANALYSIS_MODEL` | Upload, capture, curation and text search still work |
| Semantic search | `EMBEDDINGS_API_KEY`, optionally endpoint and model | Text search remains available |
| Adobe font previews | `ADOBE_FONTS_API_TOKEN` and your own font permissions | System font fallback |
| Image storage | `STORAGE_DIR` or S3-compatible credentials | A storage backend is required |

AI analysis sends screenshots and reference text to Anthropic. Embeddings send text to your configured endpoint, OpenRouter by default. Font metadata sync and previews also contact external services.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
```

The tests need Postgres with pgvector and Playwright Chromium. They use synthetic data and fake provider responses. Each test run creates and drops its own database; use a development Postgres account allowed to create databases. The default server is `postgres://postgres:postgres@localhost:54330`; override it through `TEST_DATABASE_SERVER_URL`.

| Path | Purpose |
| --- | --- |
| `apps/web` | TanStack Start application, owner access, MCP and worker APIs |
| `apps/worker` | Playwright capture worker with no direct DB or bucket access |
| `packages/db` | Drizzle schema, migrations, catalogue and search |
| `packages/mcp` | MCP tools and response formatting |
| `packages/shared`, `packages/taxonomy` | Design types, color calculations and taxonomy |
| `ops/backup` | Encrypted database and bucket backups |

Read [the architecture](docs/spec.md), [domain vocabulary](CONTEXT.md), [contribution guide](CONTRIBUTING.md), [self-hosting guide](docs/self-hosting.md) and [backup guide](docs/backup.md) for more detail.

## License

Original additions are licensed under [MIT](LICENSE). Adapted code and dependencies retain their licenses, documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE-INSPO](LICENSE-INSPO). The software license does not grant rights to collected website screenshots, third-party fonts or other uploaded content.
