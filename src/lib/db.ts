import { ConversationStatus, InferenceStatus, MessageRole, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { DashboardMetrics, InferenceLogDTO, ConversationDTO, ChatMessageDTO } from "./types";

const SYSTEM_PROMPT = [
  "You are a concise product assistant inside a logging demo.",
  "Keep answers short, practical, and grounded in the existing thread.",
  "If the context is sparse, say so and ask the smallest clarifying question.",
].join(" ");

function toConversationDTO(conversation: Awaited<ReturnType<typeof prisma.conversation.findMany>>[number], messageCount = 0, lastMessagePreview = ""): ConversationDTO {
  return {
    id: conversation.id,
    title: conversation.title,
    provider: conversation.provider,
    model: conversation.model,
    status: conversation.status,
    sessionId: conversation.sessionId,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    cancelledAt: conversation.cancelledAt?.toISOString() ?? null,
    lastActivityAt: conversation.lastActivityAt.toISOString(),
    summary: conversation.summary,
    messageCount,
    lastMessagePreview,
  };
}

function toMessageDTO(message: Awaited<ReturnType<typeof prisma.message.findMany>>[number]): ChatMessageDTO {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    tokenCount: message.tokenCount,
  };
}

function toInferenceLogDTO(log: Awaited<ReturnType<typeof prisma.inferenceLog.findMany>>[number]): InferenceLogDTO {
  return {
    id: log.id,
    conversationId: log.conversationId,
    messageId: log.messageId ?? null,
    sessionId: log.sessionId,
    provider: log.provider,
    model: log.model,
    status: log.status,
    requestStartedAt: log.requestStartedAt.toISOString(),
    requestEndedAt: log.requestEndedAt.toISOString(),
    latencyMs: log.latencyMs,
    promptTokens: log.promptTokens,
    completionTokens: log.completionTokens,
    totalTokens: log.totalTokens,
    inputPreview: log.inputPreview,
    outputPreview: log.outputPreview ?? null,
    errorMessage: log.errorMessage ?? null,
    errorCode: log.errorCode ?? null,
    metadata: (log.metadata as Record<string, unknown> | null) ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

export async function ensureDefaultConversation() {
  const existing = await prisma.conversation.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.conversation.create({
    data: {
      title: "Product logging walkthrough",
      provider: process.env.DEFAULT_PROVIDER ?? "mock",
      model: process.env.DEFAULT_MODEL ?? "gpt-4.1-mini",
      sessionId: crypto.randomUUID(),
      summary: "Seeded conversation for the demo.",
    },
  });
}

export async function listConversations() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastActivityAt: "desc" },
    include: {
      _count: {
        select: {
          messages: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return conversations.map((conversation) =>
    toConversationDTO(
      conversation,
      conversation._count.messages,
      conversation.messages[0]?.content.slice(0, 96) ?? "No messages yet",
    ),
  );
}

export async function getConversation(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return null;
  }

  return toConversationDTO(conversation, 0, "");
}

export async function getConversationMessages(conversationId: string) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map(toMessageDTO);
}

export async function createConversation(input: { provider?: string; model?: string }) {
  const provider = input.provider ?? process.env.DEFAULT_PROVIDER ?? "mock";
  const model = input.model ?? process.env.DEFAULT_MODEL ?? "gpt-4.1-mini";

  return prisma.conversation.create({
    data: {
      title: "New conversation",
      provider,
      model,
      sessionId: crypto.randomUUID(),
      summary: "Fresh session ready for a new turn.",
    },
  });
}

export async function appendMessage(input: {
  conversationId: string;
  role: MessageRole;
  content: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      tokenCount: input.tokenCount ?? 0,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      lastActivityAt: new Date(),
      summary: input.role === "user" ? input.content.slice(0, 200) : undefined,
      title: input.role === "user" ? input.content.slice(0, 42) || "New conversation" : undefined,
    },
  });

  return message;
}

export async function setConversationStatus(conversationId: string, status: ConversationStatus) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status,
      cancelledAt: status === "cancelled" ? new Date() : null,
      lastActivityAt: new Date(),
    },
  });
}

export async function createInferenceLog(input: {
  conversationId: string;
  messageId?: string | null;
  sessionId: string;
  provider: string;
  model: string;
  status: InferenceStatus;
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
}) {
  return prisma.inferenceLog.create({
    data: {
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      sessionId: input.sessionId,
      provider: input.provider,
      model: input.model,
      status: input.status,
      requestStartedAt: input.requestStartedAt,
      requestEndedAt: input.requestEndedAt,
      latencyMs: input.latencyMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      inputPreview: input.inputPreview,
      outputPreview: input.outputPreview ?? null,
      errorMessage: input.errorMessage ?? null,
      errorCode: input.errorCode ?? null,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [conversations, activeConversations, messages, logs, errorLogs, latencyAverage, throughputWindow] = await Promise.all([
    prisma.conversation.count(),
    prisma.conversation.count({ where: { status: "active" } }),
    prisma.message.count(),
    prisma.inferenceLog.count(),
    prisma.inferenceLog.count({ where: { status: "error" } }),
    prisma.inferenceLog.aggregate({ _avg: { latencyMs: true } }),
    prisma.inferenceLog.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    conversations,
    activeConversations,
    messages,
    logs,
    errorLogs,
    averageLatencyMs: Math.round(latencyAverage._avg.latencyMs ?? 0),
    throughputPerMinute: Math.round((throughputWindow / 60) * 100) / 100,
  };
}

export async function getLogs(conversationId?: string) {
  const logs = await prisma.inferenceLog.findMany({
    where: conversationId ? { conversationId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return logs.map(toInferenceLogDTO);
}

export { SYSTEM_PROMPT, toConversationDTO, toMessageDTO, toInferenceLogDTO };