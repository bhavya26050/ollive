import { NextResponse } from "next/server";
import { getLogs } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId") ?? undefined;

  try {
    const logs = await getLogs(conversationId);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Failed to fetch logs", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}