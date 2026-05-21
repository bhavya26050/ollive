import type { ChatRole } from "./types";

export type ProviderName = "mock" | "openai" | "anthropic" | "gemini";

export type NormalizedChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatGenerationInput = {
  provider: ProviderName;
  model: string;
  messages: NormalizedChatMessage[];
  signal?: AbortSignal;
};

export type ChatGenerationResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerMetadata: Record<string, unknown>;
};

function countTokensApproximate(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35));
}

function summarizeContext(messages: NormalizedChatMessage[]) {
  const recentTurns = messages.slice(-6);
  const lastUserMessage = [...recentTurns].reverse().find((message) => message.role === "user")?.content ?? "";
  return {
    recentTurns,
    lastUserMessage,
  };
}

async function generateMockReply(messages: NormalizedChatMessage[]) {
  const { recentTurns, lastUserMessage } = summarizeContext(messages);
  // Produce a concise mock reply. Use simple heuristics for common developer prompts
  // (e.g., "schema design") so the mock is helpful during offline development.
  const last = lastUserMessage.trim();
  let reply = "";

  if (!last) {
    reply = "I’m ready — send your first message and I’ll respond.";
  } else {
    const lc = last.toLowerCase();
    if (lc.includes("schema") || lc.includes("schema design") || lc.includes("db schema")) {
      reply =
        "Schema design guidance:\n- Conversation: id, title, provider, model, status, createdAt.\n- Message: id, conversationId, role, content, tokensEstimate, createdAt.\n- InferenceLog: id, conversationId, messageId, provider, model, latencyMs, promptTokens, completionTokens, totalTokens, status, preview, metadata (JSON), createdAt.\nKeep previews small and store raw payloads in JSON metadata only when necessary.";
    } else if (lc.startsWith("hello") || lc === "hi" || lc === "hey") {
      reply = "Hi — how can I help? Ask about schema design, ingestion, or provider adapters.";
    } else {
      // Short acknowledgment plus one helpful hint.
      const preview = last.length > 220 ? `${last.slice(0, 220)}…` : last;
      reply = `You said: “${preview}”.\nI can help: try asking for a schema, ingestion flow, or an example request.`;
    }
  }

  const response = [reply, "Tip: connect a real provider key to capture production inference metadata."].join("\n\n");
  return {
    content: response,
    promptTokens: countTokensApproximate(messages.map((message) => message.content).join(" \n")),
    completionTokens: countTokensApproximate(response),
    totalTokens: countTokensApproximate(`${messages.map((message) => message.content).join(" \n")} ${response}`),
    providerMetadata: { mode: "mock" },
  };
}

async function generateOpenAIReply(input: ChatGenerationInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return generateMockReply(input.messages);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: 0.4,
    }),
    signal: input.signal,
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI request failed with ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content ?? "";
  const usage = payload.usage ?? {};

  return {
    content,
    promptTokens: usage.prompt_tokens ?? countTokensApproximate(input.messages.map((message) => message.content).join(" ")),
    completionTokens: usage.completion_tokens ?? countTokensApproximate(content),
    totalTokens:
      usage.prompt_tokens != null && usage.completion_tokens != null
        ? usage.prompt_tokens + usage.completion_tokens
        : countTokensApproximate(`${input.messages.map((message) => message.content).join(" ")} ${content}`),
    providerMetadata: { rawUsage: usage },
  };
}

async function generateAnthropicReply(input: ChatGenerationInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return generateMockReply(input.messages);
  }

  const systemMessage = input.messages.find((message) => message.role === "system")?.content ?? "";
  const messages = input.messages.filter((message) => message.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 1024,
      system: systemMessage,
      messages: messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    }),
    signal: input.signal,
  });

  const payload = (await response.json()) as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Anthropic request failed with ${response.status}`);
  }

  const content = payload.content?.map((chunk) => chunk.text ?? "").join("") ?? "";
  const usage = payload.usage ?? {};

  return {
    content,
    promptTokens: usage.input_tokens ?? countTokensApproximate(messages.map((message) => message.content).join(" ")),
    completionTokens: usage.output_tokens ?? countTokensApproximate(content),
    totalTokens:
      usage.input_tokens != null && usage.output_tokens != null
        ? usage.input_tokens + usage.output_tokens
        : countTokensApproximate(`${messages.map((message) => message.content).join(" ")} ${content}`),
    providerMetadata: { rawUsage: usage },
  };
}

async function generateGeminiReply(input: ChatGenerationInput) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return generateMockReply(input.messages);
  }

  const contents = input.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    headers["x-goog-api-key"] = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    }),
    signal: input.signal,
  });

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gemini request failed with ${response.status}`);
  }

  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const usage = payload.usageMetadata ?? {};

  return {
    content,
    promptTokens: usage.promptTokenCount ?? countTokensApproximate(input.messages.map((message) => message.content).join(" ")),
    completionTokens: usage.candidatesTokenCount ?? countTokensApproximate(content),
    totalTokens:
      usage.promptTokenCount != null && usage.candidatesTokenCount != null
        ? usage.promptTokenCount + usage.candidatesTokenCount
        : countTokensApproximate(`${input.messages.map((message) => message.content).join(" ")} ${content}`),
    providerMetadata: { rawUsage: usage },
  };
}

export async function generateChatReply(input: ChatGenerationInput): Promise<ChatGenerationResult> {
  switch (input.provider) {
    case "openai":
      return generateOpenAIReply(input);
    case "anthropic":
      return generateAnthropicReply(input);
    case "gemini":
      return generateGeminiReply(input);
    default:
      return generateMockReply(input.messages);
  }
}