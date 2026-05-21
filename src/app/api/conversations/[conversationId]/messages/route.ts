import { NextResponse } from "next/server";
import { appendMessage, getConversation, getConversationMessages, SYSTEM_PROMPT } from "@/lib/db";
import { clearConversationAbortController, getConversationAbortController } from "@/lib/conversation-controllers";
import { sendMessageSchema, conversationIdParamSchema } from "@/lib/schemas";
import { generateChatReply, type ProviderName } from "@/lib/providers";
import { ingestInferenceLog } from "@/lib/inference-logger";
import { redactSensitiveText } from "@/lib/redact";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

function buildBaseUrl(request: Request) {
  return new URL(request.url).origin;
}

export async function POST(request: Request, context: RouteContext) {
  const params = await context.params;
  const parsedParams = conversationIdParamSchema.safeParse(params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsedBody = sendMessageSchema.safeParse(payload);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid message payload" }, { status: 400 });
  }

  const conversation = await getConversation(parsedParams.data.conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.status === "cancelled") {
    return NextResponse.json({ error: "Conversation is cancelled. Resume it before sending another message." }, { status: 409 });
  }

  const requestStartedAt = new Date();
  const baseUrl = buildBaseUrl(request);
  const provider = (parsedBody.data.provider ?? conversation.provider ?? "mock") as ProviderName;
  const model = parsedBody.data.model ?? conversation.model;
  const sessionId = conversation.sessionId;
  const controller = getConversationAbortController(conversation.id);

  const userMessage = await appendMessage({
    conversationId: conversation.id,
    role: "user",
    content: parsedBody.data.content,
    tokenCount: parsedBody.data.content.split(/\s+/).filter(Boolean).length,
    metadata: { source: "ui" },
  });

  const history = await getConversationMessages(conversation.id);
  const contextMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.slice(-8).map((message) => ({ role: message.role, content: message.content })),
  ];

  let generation;
  try {
    generation = await generateChatReply({
      provider,
      model,
      messages: contextMessages,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      const cancelledConversation = await getConversation(conversation.id);
      const cancellationConversation = cancelledConversation ?? conversation;

      return NextResponse.json({
        cancelled: true,
        conversation: cancellationConversation,
        messages: await getConversationMessages(conversation.id),
      });
    }

    const requestEndedAt = new Date();
    const latencyMs = requestEndedAt.getTime() - requestStartedAt.getTime();

    await ingestInferenceLog(
      {
        conversationId: conversation.id,
        messageId: userMessage.id,
        sessionId,
        provider,
        model,
        status: "error",
        requestStartedAt,
        requestEndedAt,
        latencyMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        inputPreview: redactSensitiveText(parsedBody.data.content),
        errorMessage: error instanceof Error ? error.message : "Unknown generation error",
        errorCode: error instanceof Error ? error.name : "unknown_error",
        metadata: { baseUrl, redacted: true },
      },
      { endpoint: `${baseUrl}/api/ingest` },
    ).catch(() => undefined);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed" }, { status: 502 });
  } finally {
    clearConversationAbortController(conversation.id, controller);
  }

  const requestEndedAt = new Date();
  const latencyMs = requestEndedAt.getTime() - requestStartedAt.getTime();

  const latestConversation = await getConversation(conversation.id);
  if (latestConversation?.status === "cancelled") {
    await ingestInferenceLog(
      {
        conversationId: conversation.id,
        messageId: userMessage.id,
        sessionId,
        provider,
        model,
        status: "cancelled",
        requestStartedAt,
        requestEndedAt,
        latencyMs,
        promptTokens: generation.promptTokens,
        completionTokens: generation.completionTokens,
        totalTokens: generation.totalTokens,
        inputPreview: redactSensitiveText(parsedBody.data.content),
        outputPreview: redactSensitiveText(generation.content),
        metadata: { ...generation.providerMetadata, baseUrl, redacted: true },
      },
      { endpoint: `${baseUrl}/api/ingest` },
    ).catch(() => undefined);

    return NextResponse.json({
      cancelled: true,
      conversation: latestConversation,
      messages: await getConversationMessages(conversation.id),
    });
  }

  const assistantMessage = await appendMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: generation.content,
    tokenCount: generation.completionTokens,
    metadata: { provider, model, latencyMs },
  });

  await ingestInferenceLog(
    {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      sessionId,
      provider,
      model,
      status: "success",
      requestStartedAt,
      requestEndedAt,
      latencyMs,
      promptTokens: generation.promptTokens,
      completionTokens: generation.completionTokens,
      totalTokens: generation.totalTokens,
      inputPreview: redactSensitiveText(parsedBody.data.content),
      outputPreview: redactSensitiveText(generation.content),
      metadata: { ...generation.providerMetadata, baseUrl, redacted: true },
    },
    { endpoint: `${baseUrl}/api/ingest` },
  ).catch(() => undefined);

  return NextResponse.json({
    conversation: await getConversation(conversation.id),
    messages: await getConversationMessages(conversation.id),
    assistantMessage,
  });
}