"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { ConversationDTO, DashboardMetrics, ChatMessageDTO, InferenceLogDTO } from "@/lib/types";

type ApiConversationResponse = { conversations: ConversationDTO[]; metrics: DashboardMetrics };
type ApiConversationDetailResponse = { conversation: ConversationDTO; messages: ChatMessageDTO[] };
type ApiMessageResponse = { conversation: ConversationDTO; messages: ChatMessageDTO[]; assistantMessage?: ChatMessageDTO; cancelled?: boolean };
type LogsResponse = { logs: InferenceLogDTO[] };

type ChatShellProps = {
  initialConversations: ConversationDTO[];
  initialMetrics: DashboardMetrics;
  initialConversation: ConversationDTO | null;
  initialMessages: ChatMessageDTO[];
  initialLogs: InferenceLogDTO[];
};

const DATE_LOCALE = "en-US";
const DATE_TIME_ZONE = "UTC";

function formatRelativeDate(value: string) {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DATE_TIME_ZONE,
  }).format(new Date(value));
}

function formatCompactTime(value: string) {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: DATE_TIME_ZONE,
  }).format(new Date(value));
}

export function ChatShell({
  initialConversations,
  initialMetrics,
  initialConversation,
  initialMessages,
  initialLogs,
}: ChatShellProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(initialMetrics);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConversation?.id ?? null);
  const [activeConversation, setActiveConversation] = useState<ConversationDTO | null>(initialConversation);
  const [messages, setMessages] = useState(initialMessages);
  const [logs, setLogs] = useState(initialLogs);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConversationLabel = useMemo(() => {
    if (!activeConversation) return "No conversation selected";
    return `${activeConversation.title} · ${activeConversation.provider}/${activeConversation.model}`;
  }, [activeConversation]);

  const stats = [
    { label: "Conversations", value: metrics?.conversations ?? 0, hint: `${metrics?.activeConversations ?? 0} active` },
    { label: "Messages", value: metrics?.messages ?? 0, hint: "short context window" },
    { label: "Avg latency", value: `${metrics?.averageLatencyMs ?? 0} ms`, hint: `${metrics?.throughputPerMinute ?? 0} / min` },
    { label: "Errors", value: metrics?.errorLogs ?? 0, hint: "best-effort logging" },
  ];

  async function loadOverview(selectConversationId?: string) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load conversations (${response.status})`);

      const payload = (await response.json()) as ApiConversationResponse;
      setConversations(payload.conversations);
      setMetrics(payload.metrics);

      const nextConversationId = selectConversationId ?? payload.conversations[0]?.id ?? null;
      setActiveConversationId(nextConversationId);

      if (nextConversationId) {
        await loadConversation(nextConversationId, false);
      } else {
        setActiveConversation(null);
        setMessages([]);
        setLogs([]);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load the dashboard");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadConversation(conversationId: string, shouldSetSelection = true) {
    try {
      const [conversationResponse, logsResponse] = await Promise.all([
        fetch(`/api/conversations/${conversationId}`, { cache: "no-store" }),
        fetch(`/api/logs?conversationId=${conversationId}`, { cache: "no-store" }),
      ]);

      if (!conversationResponse.ok) throw new Error(`Failed to load conversation (${conversationResponse.status})`);
      if (!logsResponse.ok) throw new Error(`Failed to load logs (${logsResponse.status})`);

      const conversationPayload = (await conversationResponse.json()) as ApiConversationDetailResponse;
      const logsPayload = (await logsResponse.json()) as LogsResponse;

      if (shouldSetSelection) setActiveConversationId(conversationId);
      setActiveConversation(conversationPayload.conversation);
      setMessages(conversationPayload.messages);
      setLogs(logsPayload.logs);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load conversation");
    }
  }

  async function createConversation() {
    if (isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: activeConversation?.provider, model: activeConversation?.model }),
      });

      if (!response.ok) {
        setError(`Failed to create a conversation (${response.status})`);
        return;
      }

      const payload = (await response.json()) as { conversation: ConversationDTO };
      startTransition(() => {
        void loadOverview(payload.conversation.id);
      });
    } catch (error) {
      console.error("Failed to create conversation", error);
      setError(error instanceof Error ? `Failed to create conversation: ${error.message}` : "Failed to create conversation");
    } finally {
      setIsCreating(false);
    }
  }

  async function cancelConversation(conversationId = activeConversationId) {
    if (!conversationId) return;

    abortControllerRef.current?.abort();

    const response = await fetch(`/api/conversations/${conversationId}/cancel`, { method: "POST" });
    if (!response.ok) {
      setError(`Failed to cancel conversation (${response.status})`);
      return;
    }

    await loadOverview(conversationId);
  }

  async function resumeConversation(conversationId = activeConversationId) {
    if (!conversationId) return;

    const response = await fetch(`/api/conversations/${conversationId}/resume`, { method: "POST" });
    if (!response.ok) {
      setError(`Failed to resume conversation (${response.status})`);
      return;
    }

    await loadOverview(conversationId);
  }

  async function sendMessage() {
    if (!activeConversationId || !input.trim() || isSending) return;

    const currentConversation = activeConversation;
    if (!currentConversation) return;

    setIsSending(true);
    setError(null);
    setPendingMessage(input.trim());

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ content: input.trim(), provider: currentConversation.provider, model: currentConversation.model }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? `Message request failed (${response.status})`);
      }

      const payload = (await response.json()) as ApiMessageResponse;
      setInput("");
      await loadOverview(payload.conversation.id);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        setError("Request cancelled.");
      } else {
        setError(error instanceof Error ? error.message : "Failed to send message");
      }
    } finally {
      setPendingMessage(null);
      setIsSending(false);
      abortControllerRef.current = null;
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020308] px-4 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-6rem] h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-[-6rem] top-[12rem] h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[18%] h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1680px] flex-col gap-4">
        <header className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[rgba(10,14,24,0.72)] px-5 py-5 shadow-[0_30px_120px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-100">
              inference logging demo
            </div>
            <h1 className="mt-4 max-w-3xl bg-gradient-to-r from-slate-50 via-cyan-100 to-sky-300 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-5xl">
              A modern LLM workspace for conversations, observability, and ingestion.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Multi-turn chat with short context, provider-agnostic inference logging, runtime ingestion, and a sleek dashboard built on a black glass background.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={() => void createConversation()}
              disabled={isCreating}
              className="rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 px-5 py-2.5 font-semibold text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              New conversation
            </button>
            <button
              type="button"
              onClick={() => void loadOverview(activeConversationId ?? undefined)}
              className="rounded-full border border-white/12 bg-white/5 px-5 py-2.5 font-semibold text-slate-100 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[28px] border border-white/10 bg-[rgba(10,14,24,0.72)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-50">{stat.value}</p>
              <p className="mt-2 text-sm text-slate-400">{stat.hint}</p>
            </div>
          ))}
        </section>

        <main className="grid flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="rounded-[32px] border border-white/10 bg-[rgba(10,14,24,0.72)] p-4 shadow-[0_18px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)] xl:self-start">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Sessions</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-50">Conversation list</h2>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">{conversations.length} live</span>
            </div>

            <div className="space-y-2 overflow-auto pr-1">
              {conversations.map((conversation) => {
                const selected = conversation.id === activeConversationId;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => void loadConversation(conversation.id)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition duration-200 ${
                      selected
                        ? "border-cyan-300/40 bg-cyan-300/10 shadow-[0_12px_40px_rgba(56,189,248,0.1)]"
                        : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-50">{conversation.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{conversation.provider} / {conversation.model}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${conversation.status === "active" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"}`}>
                        {conversation.status}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">{conversation.lastMessagePreview}</p>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>{conversation.messageCount} messages</span>
                      <span>{formatRelativeDate(conversation.lastActivityAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-[72vh] flex-col rounded-[32px] border border-white/10 bg-[rgba(10,14,24,0.72)] shadow-[0_18px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl xl:min-h-[calc(100vh-16rem)]">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Active thread</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-50">{activeConversationLabel}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{activeConversation?.summary ?? "Select a conversation to resume context."}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => void cancelConversation()}
                    disabled={!activeConversationId || isSending}
                    className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 font-semibold text-rose-200 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Cancel conversation
                  </button>
                  <button
                    type="button"
                    onClick={() => void resumeConversation()}
                    disabled={!activeConversationId || isSending}
                    className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Resume conversation
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-auto px-5 py-5 sm:px-6">
              {isLoading ? (
                <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] px-6 py-14 text-center text-slate-400">
                  Loading conversations and logs...
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] px-6 py-14 text-center text-slate-400">
                  Start the thread with a question about the logging pipeline, schema design, or demo tradeoffs.
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[82%] rounded-[28px] border px-5 py-4 shadow-[0_14px_40px_rgba(0,0,0,0.35)] ${
                      message.role === "user"
                        ? "ml-auto border-cyan-300/20 bg-gradient-to-br from-cyan-300/12 to-sky-500/10 text-slate-50"
                        : "border-white/10 bg-white/[0.04] text-slate-100"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      <span>{message.role}</span>
                      <span>{formatCompactTime(message.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">{message.content}</p>
                  </article>
                ))
              )}

              {pendingMessage ? (
                <article className="ml-auto max-w-[82%] rounded-[28px] border border-amber-300/20 bg-gradient-to-br from-amber-300/12 to-orange-400/10 px-5 py-4 text-slate-50 shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.3em] text-amber-200/80">pending</div>
                  <p className="whitespace-pre-wrap text-sm leading-7">{pendingMessage}</p>
                </article>
              ) : null}
            </div>

            <div className="border-t border-white/10 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Short context window: last 8 messages</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Logs are ingested per turn</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">PII previews are redacted</span>
                </div>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about schema design, failure handling, or the ingestion path..."
                  className="min-h-28 w-full resize-none rounded-[24px] border border-white/10 bg-[#050912] px-4 py-3.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-slate-400">
                    {isSending ? "Generating a response and publishing the inference log..." : "The assistant uses provider-specific keys when available, otherwise it falls back to a local demo response."}
                  </p>
                  <div className="flex gap-2">
                    {isSending ? (
                      <button
                        type="button"
                        onClick={() => void cancelConversation()}
                        className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]"
                      >
                        Abort generation
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={!activeConversationId || !input.trim() || isSending || activeConversation?.status === "cancelled"}
                      className="rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send message
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-[32px] border border-white/10 bg-[rgba(10,14,24,0.72)] p-4 shadow-[0_18px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)] xl:self-start">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Ingestion</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-50">Latest logs</h2>
            </div>

            <div className="mt-4 space-y-3 overflow-auto pr-1">
              {logs.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-8 text-sm leading-6 text-slate-400">
                  No inference logs yet for this conversation.
                </div>
              ) : (
                logs.map((log) => (
                  <article key={log.id} className="rounded-[28px] border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-50">{log.provider} / {log.model}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatCompactTime(log.createdAt)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${log.status === "success" ? "bg-emerald-400/15 text-emerald-300" : log.status === "error" ? "bg-rose-400/15 text-rose-300" : "bg-amber-400/15 text-amber-300"}`}>
                        {log.status}
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300">
                      <div>
                        <dt className="text-slate-500">Latency</dt>
                        <dd className="mt-1 font-medium text-slate-100">{log.latencyMs} ms</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Tokens</dt>
                        <dd className="mt-1 font-medium text-slate-100">{log.totalTokens}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Prompt</dt>
                        <dd className="mt-1 line-clamp-2 text-slate-200">{log.inputPreview}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Output</dt>
                        <dd className="mt-1 line-clamp-2 text-slate-200">{log.outputPreview ?? log.errorMessage ?? "-"}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>

            <div className="mt-4 rounded-[28px] border border-cyan-300/15 bg-gradient-to-br from-cyan-300/10 to-sky-400/5 p-4 text-sm text-slate-200 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
              <p className="font-semibold text-cyan-200">Dashboard summary</p>
              <ul className="mt-3 space-y-2 text-slate-300">
                <li>Active conversations: {metrics?.activeConversations ?? 0}</li>
                <li>Logs in last hour: {metrics?.throughputPerMinute ?? 0} / min</li>
                <li>Current state: {activeConversation?.status ?? "idle"}</li>
              </ul>
            </div>
          </aside>
        </main>

        {error ? (
          <div className="rounded-[24px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
            {error}
          </div>
        ) : null}

        {isPending ? <span className="sr-only">Updating conversations</span> : null}
      </div>
    </div>
  );
}