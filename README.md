
# Ollive — Quickstart

Minimal local dev instructions and project layout.

Quickstart

- Copy `.env.example` to `.env.local` and set provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`).
- Install and run locally:

```bash
cd ollive
npm ci
npm run db:push
npm run dev
# open http://localhost:3000
```

Project layout (essential files)

- `src/components/chat-shell.tsx`: UI and client interactions.
- `src/lib/providers.ts`: Provider adapters (mock, OpenAI, Anthropic, Gemini).
- `src/lib/inference-logger.ts`: Wraps provider calls and forwards logs to the ingestion API.
- `src/app/api/*`: Route handlers for conversations, messages, ingest, and logs.
- `prisma/schema.prisma`: Database schema. Use `npm run db:push` to initialize local SQLite.

Security notes

- Do not commit secrets. Add keys to `.env.local` and rotate any exposed keys immediately.
- The repo ignores `.env*` and `prisma/*.db` by default (see `.gitignore`).

If you'd like, I can further simplify components or add inline docs to functions to make the code easier for new contributors to understand.
