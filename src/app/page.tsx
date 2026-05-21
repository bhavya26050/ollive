import { ChatShell } from "@/components/chat-shell";
import { ensureDefaultConversation, getConversationMessages, getDashboardMetrics, getLogs, listConversations } from "@/lib/db";

export default async function Home() {
  await ensureDefaultConversation();

  const [conversations, metrics] = await Promise.all([listConversations(), getDashboardMetrics()]);
  const initialConversation = conversations[0] ?? null;
  const [initialMessages, initialLogs] = initialConversation
    ? await Promise.all([getConversationMessages(initialConversation.id), getLogs(initialConversation.id)])
    : [[], []];

  return (
    <ChatShell
      initialConversations={conversations}
      initialMetrics={metrics}
      initialConversation={initialConversation}
      initialMessages={initialMessages}
      initialLogs={initialLogs}
    />
  );
}
