# Architecture Notes

## Ingestion Flow

1. The UI sends a chat turn to `POST /api/conversations/[conversationId]/messages`.
2. The route loads the short context window, calls the selected provider adapter, and writes the user and assistant messages to MongoDB via Prisma.
3. The inference wrapper redacts sensitive text, converts the result into an ingestion payload, and posts it to `POST /api/ingest`.
4. The ingestion route validates the payload with `zod`, normalizes the timestamps and numbers, and persists the record through Prisma.

## Logging Strategy

1. Store the canonical chat transcript in `Message`.
2. Store observability records in `InferenceLog` with request status, latency, token counts, and session identity.
3. Keep previews short and redacted so the logs are useful for debugging without duplicating full conversation content everywhere.
4. Attach flexible `metadata` JSON for provider-specific or future fields that do not belong in first-class columns yet.

## Scaling Considerations

1. MongoDB is a good fit here because the app stores flexible conversation and log documents while keeping the API simple.
2. The ingestion boundary can later be replaced with a queue or event bus without changing the UI contract.
3. Conversation reads are already paginable and the context window is intentionally small to keep inference cost bounded.
4. Metrics are computed from database aggregates; for larger scale, precomputed rollups or a metrics store would be better.

## Failure Handling Assumptions

1. If provider credentials are missing, the app falls back to a mock response so the demo still works locally.
2. If ingestion fails, the chat route still completes; the current implementation treats observability as best-effort instead of blocking the user experience.
3. Canceling a conversation marks the session as canceled and prevents new turns until it is resumed.
4. Payload validation happens before persistence so malformed logs fail fast and do not poison the database.