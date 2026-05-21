import type { ConversationStatus, InferenceStatus, MessageRole } from "@prisma/client";

export type ChatRole = MessageRole;
export type ChatStatus = ConversationStatus;
export type LogStatus = InferenceStatus;

export type ChatMessageDTO = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  tokenCount: number;
};

export type ConversationDTO = {
  id: string;
  title: string;
  provider: string;
  model: string;
  status: ChatStatus;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  lastActivityAt: string;
  summary: string;
  messageCount: number;
  lastMessagePreview: string;
};

export type InferenceLogDTO = {
  id: string;
  conversationId: string;
  messageId: string | null;
  sessionId: string;
  provider: string;
  model: string;
  status: LogStatus;
  requestStartedAt: string;
  requestEndedAt: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputPreview: string;
  outputPreview: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type DashboardMetrics = {
  conversations: number;
  activeConversations: number;
  messages: number;
  logs: number;
  errorLogs: number;
  averageLatencyMs: number;
  throughputPerMinute: number;
};