import { NextResponse } from "next/server";
import { ingestLogSchema } from "@/lib/schemas";
import { createInferenceLog } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ingestLogSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid ingestion payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const log = await createInferenceLog({
      ...parsed.data,
      requestStartedAt: new Date(parsed.data.requestStartedAt),
      requestEndedAt: new Date(parsed.data.requestEndedAt),
    });

    return NextResponse.json({ ok: true, id: log.id });
  } catch (error) {
    console.error("Failed to persist inference log", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}