import { NextResponse } from "next/server";
import { createConversationSchema } from "@/lib/schemas";
import { createConversation, ensureDefaultConversation, getDashboardMetrics, listConversations } from "@/lib/db";

export async function GET() {
  await ensureDefaultConversation();
  const [conversations, metrics] = await Promise.all([listConversations(), getDashboardMetrics()]);

  return NextResponse.json({ conversations, metrics });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = createConversationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid conversation payload" }, { status: 400 });
  }

  const conversation = await createConversation(parsed.data);
  return NextResponse.json({ conversation });
}