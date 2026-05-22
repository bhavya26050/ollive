Overview

This file explains the minimal, important parts of the codebase so a new contributor can get started quickly.

Quick map

- `src/components/chat-shell.tsx` — The React chat UI. Handles conversation selection, new conversation creation, message input, and calls the messages route to generate replies.

- `src/lib/providers.ts` — Provider adapters. Contains `generateChatReply()` which dispatches to provider-specific functions:
  - `generateMockReply()` — Local fallback that simulates a reply.
  - `generateOpenAIReply()` — Calls OpenAI chat completions.
  - `generateAnthropicReply()` — Calls Anthropic messages endpoint.
  - `generateGeminiReply()` — Calls Google Generative Language API using `x-goog-api-key` header.

- `src/lib/inference-logger.ts` — Wraps provider calls and creates/redacts an `InferenceLog` payload. It posts to `/api/ingest` when ingestion is configured, otherwise stores directly via Prisma helper.

- `src/lib/db.ts` — Prisma helpers: conversations, messages, and inference log create/list functions. Use `createInferenceLog()` to persist logs.

- `src/lib/prisma.ts` — Prisma client instance for the app.

- `src/lib/conversation-controllers.ts` — Tracks an `AbortController` per conversation to enable cancellation via the cancel route.

- `src/app/api/*` — Next.js route handlers:
  - `/api/conversations` — list and create conversations.
  - `/api/conversations/[conversationId]/messages` — send a message and generate a provider reply.
  - `/api/conversations/[conversationId]/cancel` — cancel in-flight generation.
  - `/api/ingest` — ingestion endpoint that validates ingestion payloads and stores them in the DB.
  - `/api/logs` — fetch logs for dashboard use.

Notes for contributors

- Secrets: add API keys to `.env.local`. Do not commit `.env` files. Rotate keys if they are ever exposed.
- DB: the project uses MongoDB through Prisma. Use `npm run db:push` to initialize the schema against your local MongoDB instance or hosted cluster.
- Running: `npm ci && npm run dev` runs the app locally.

If you want I can also:
- Add JSDoc comments in critical functions (providers, inference logger, db helpers).
- Rename or split large files into smaller modules for faster onboarding.
- Remove any remaining committed artifacts if you approve.
