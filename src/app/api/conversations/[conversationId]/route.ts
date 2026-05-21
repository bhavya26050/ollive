import { NextResponse } from "next/server";
import { conversationIdParamSchema } from "@/lib/schemas";
import { getConversation, getConversationMessages } from "@/lib/db";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const parsed = conversationIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const conversation = await getConversation(parsed.data.conversationId);

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = await getConversationMessages(parsed.data.conversationId);

  return NextResponse.json({ conversation, messages });
}