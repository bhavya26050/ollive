import { createInferenceLog } from "./db";
import { redactSensitiveText } from "./redact";
import type { LogStatus } from "./types";

export type InferenceLogInput = {
  conversationId: string;
  messageId?: string | null;
  sessionId: string;
  provider: string;
  model: string;
  status: LogStatus;
  requestStartedAt: Date;
  requestEndedAt: Date;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputPreview: string;
  outputPreview?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
};

function normalizePayload(input: InferenceLogInput) {
  return {
    ...input,
    inputPreview: redactSensitiveText(input.inputPreview),
    outputPreview: input.outputPreview ? redactSensitiveText(input.outputPreview) : null,
    errorMessage: input.errorMessage ? redactSensitiveText(input.errorMessage, 500) : null,
  };
}

export async function ingestInferenceLog(input: InferenceLogInput, options?: { endpoint?: string }) {
  const payload = normalizePayload(input);
  const endpoint = options?.endpoint;

  if (endpoint) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Number(process.env.INGEST_LOG_TIMEOUT_MS ?? 5000));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ingestion endpoint returned ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return undefined;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return createInferenceLog(payload);
}