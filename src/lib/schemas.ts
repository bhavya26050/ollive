import { z } from "zod";

const roleSchema = z.enum(["system", "user", "assistant"]);

export const messageSchema = z.object({
  id: z.string(),
  role: roleSchema,
  content: z.string(),
  createdAt: z.string(),
  tokenCount: z.number().int().nonnegative(),
});

export const ingestLogSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().nullable().optional(),
  sessionId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(["success", "error", "cancelled"]),
  requestStartedAt: z.string().datetime(),
  requestEndedAt: z.string().datetime(),
  latencyMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative().optional().default(0),
  completionTokens: z.number().int().nonnegative().optional().default(0),
  totalTokens: z.number().int().nonnegative().optional().default(0),
  inputPreview: z.string(),
  outputPreview: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createConversationSchema = z.object({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(12000),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export const conversationIdParamSchema = z.object({
  conversationId: z.string().min(1),
});