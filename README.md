# Ollive — Lightweight Inference Logging & Chat Demo

Ollive is a compact demo that demonstrates a provider-agnostic multi-turn chat UI, inference logging/ingestion, and a minimal observability schema. It is intended as a teachable reference for building LLM-powered products with per-inference observability.

This repository contains:
- A Next.js (App Router) frontend + API routes (TypeScript)
- Provider adapters for Mock, OpenAI, Anthropic and Google Gemini
- An ingestion API that validates and persists inference logs via Prisma + MongoDB
- A small React chat UI that exercises the stack end-to-end
- Docker + docker-compose for local containerized runs
- A GitHub Action that runs a smoke test on push/PR

If you want a small, understandable example of how to capture model observability per-turn (latency, tokens, status, previews, structured metadata), this repo is for you.

**Status:** demo-ready. Use for local testing and reference; not intended as production-ready infrastructure out of the box.

**Repository:** https://github.com/bhavya26050/ollive

## Quickstart (Local)

Prerequisites
- Node.js 20+ and npm
- Git
- (Optional) Docker & docker-compose

Steps

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/bhavya26050/ollive.git
cd ollive/ollive
npm ci
```

2. Create local env file:

```bash
cp .env.example .env.local
# Edit .env.local and set provider keys as needed (do not commit)
```

3. Start MongoDB and initialize the local database:

```bash
docker compose up -d mongo
```

Then push the Prisma schema:

```bash
npm run db:push
```

4. Run the app in development:

```bash
npm run dev
# Open http://localhost:3000
```

5. Run the smoke test (exercises API endpoints):

```bash
node scripts/smoke-test.js
```

To test Google Gemini end-to-end (server-side), add `GOOGLE_GENERATIVE_AI_API_KEY` or `GOOGLE_GENERATIVE_AI_OAUTH_TOKEN` to `.env.local`, restart dev server, then run:

```bash
node scripts/test-gemini.js
```

## Architecture (high level)

The system is intentionally small and composed of a few layers:

- UI (Next.js + React): `src/components/chat-shell.tsx` — multi-turn chat UI and state.
- API routes (Next.js app router): `src/app/api/*` — conversation CRUD, messages (generation), ingestion, logs.
- Provider adapters: `src/lib/providers.ts` — dispatches to provider-specific code and returns normalized generation metadata.
- Ingestion wrapper: `src/lib/inference-logger.ts` — creates a sanitized `InferenceLog` payload, posts to `/api/ingest` (or writes to DB directly in demo mode).
- DB helpers (Prisma): `src/lib/db.ts` + `prisma/schema.prisma` — stores `Conversation`, `Message`, and `InferenceLog` entities.

Mermaid overview

```mermaid
flowchart LR
  UI[Chat UI]
  UI --> API_Messages[POST /api/conversations/:id/messages]
  API_Messages --> Providers[Provider Adapter]
  Providers -->|response + metadata| API_Messages
  API_Messages --> DB[Prisma / MongoDB]
  API_Messages --> Ingest[/api/ingest]
  Ingest --> DB
  DB --> Dashboard[UI: Logs & Metrics]
```

## Data Model (summary)

Primary entities (see `prisma/schema.prisma`):

- Conversation
  - id, title, provider, model, sessionId, status, summary, createdAt, updatedAt
- Message
  - id, conversationId, role (system/user/assistant), content, tokenCount, metadata, createdAt
- InferenceLog
  - id, conversationId, messageId, sessionId, provider, model, status (success/error/cancelled), latencyMs,
    promptTokens, completionTokens, totalTokens, inputPreview, outputPreview, metadata (JSON), createdAt

Design notes
- Previews are intentionally short and redacted for PII; raw payloads and provider responses can be stored in the JSON `metadata` field when necessary.

## API Endpoints

- `GET /api/conversations` — list conversations + dashboard metrics
- `POST /api/conversations` — create a conversation
- `GET /api/conversations/:id` — get conversation details
- `POST /api/conversations/:id/messages` — send a user message (generates assistant reply via selected provider)
- `POST /api/conversations/:id/cancel` — cancel an in-flight generation
- `POST /api/ingest` — ingestion endpoint (validated via Zod)
- `GET /api/logs?conversationId=...` — fetch logs for dashboard

Use the Node smoke tests (`scripts/smoke-test.js`) to exercise these routes locally — they handle quoting/Windows issues.

## Environment Variables

Add these to your local `.env.local` (do NOT commit):

- `DATABASE_URL` — MongoDB connection string used by Prisma (local MongoDB, MongoDB Atlas, or another hosted MongoDB).
- `DEFAULT_PROVIDER` — `mock` (default) or one of `openai`, `anthropic`, `gemini`.
- `DEFAULT_MODEL` — default model name to use when creating new conversations.
- `OPENAI_API_KEY` — optional for OpenAI provider.
- `ANTHROPIC_API_KEY` — optional for Anthropic provider.
- `GOOGLE_GENERATIVE_AI_API_KEY` — optional (x-goog-api-key header / `?key=` fallback).
- `GOOGLE_GENERATIVE_AI_OAUTH_TOKEN` — optional (Bearer token support, preferred for production).

Secrets management
- Never commit `.env.local`. Use environment variables in your deployment platform or a secrets manager.

## Providers

`src/lib/providers.ts` implements adapters for supported providers and returns a normalized `ChatGenerationResult`:
- `content`, `promptTokens`, `completionTokens`, `totalTokens`, `providerMetadata`.

The Gemini adapter supports three auth styles (in order of preference):
1. `GOOGLE_GENERATIVE_AI_OAUTH_TOKEN` (Authorization: Bearer)
2. `GOOGLE_GENERATIVE_AI_API_KEY` via `x-goog-api-key` header
3. `?key=` query param fallback

## Running in Docker (local)

The repo includes a `Dockerfile`, `docker-entrypoint.sh`, and `docker-compose.yml` for local containerized runs. The Compose file starts MongoDB and mounts a named volume so data persists between restarts.

Basic usage:

```bash
docker compose up --build

# or detach
docker compose up -d --build
```

Note: For production, use MongoDB Atlas or another managed MongoDB and update `DATABASE_URL` accordingly.

## CI / Smoke Tests

This repo contains a GitHub Actions workflow `.github/workflows/smoke-test.yml` that runs the Node smoke test on push/PR. The smoke test exercises the main API routes to ensure the app boots and routes behave.

## Security & Best Practices

- Rotate any API key immediately if it is accidentally exposed.
- Use OAuth tokens or server-to-server auth for production provider calls when available.
- Avoid file-based databases in production; use a managed MongoDB and configure `DATABASE_URL`.
- Limit retention of PII in `inputPreview` / `outputPreview`. Prefer storing raw payloads only in secured metadata fields if necessary.

## Contributing

- See `CONTRIBUTING.md` for local dev, how to remove committed DB files, and standard workflows.
- Keep changes small and focused: this repo is meant to be a readable example.

## Troubleshooting

- "Invalid message payload" when curling: PowerShell quoting often breaks JSON — use the included Node smoke tests or `curl` from WSL/bash.
- Prisma client generation on Windows: `npm run db:push` may need the `--skip-generate` flag; `npm ci` runs `prisma generate` in postinstall.

## File Map (important files)

- `src/components/chat-shell.tsx` — main UI
- `src/lib/providers.ts` — provider adapters
- `src/lib/inference-logger.ts` — ingestion wrapper
- `src/lib/db.ts` — Prisma helpers
- `src/app/api/*` — route handlers
- `prisma/schema.prisma` — DB schema

## Deployment recommendations

Preferred: Vercel (Next.js)
- Root directory: `ollive`
- Set env vars in Vercel Project Settings: `DATABASE_URL` (MongoDB recommended), provider keys.

Alternative: Docker-compose on a VM / cloud provider
- Use the supplied `docker-compose.yml` and a persistent DB volume.

## License

This demo is provided as-is for educational purposes. Modify and reuse as needed.

---

If you want, I can now: (A) deploy to Vercel for you (I can provision the project and set env vars), (B) prepare a GitHub Release from `v1.0.0`, or (C) remove any remaining local artifacts before deployment. Tell me which to do next.
