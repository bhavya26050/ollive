import { NextResponse } from "next/server";
import { abortConversationRequest } from "@/lib/conversation-controllers";
import { conversationIdParamSchema } from "@/lib/schemas";
import { setConversationStatus } from "@/lib/db";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const params = await context.params;
  const parsed = conversationIdParamSchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  abortConversationRequest(parsed.data.conversationId);
  const conversation = await setConversationStatus(parsed.data.conversationId, "cancelled");
  return NextResponse.json({ conversation });
}