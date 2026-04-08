import { NextResponse } from "next/server";
import { runTask } from "@/automation/runner";
import { sendTelegramMessage } from "@/lib/telegram-sender";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = Number.parseInt(id, 10);
  if (Number.isNaN(taskId)) {
    return NextResponse.json({ error: "invalid task id" }, { status: 400 });
  }

  try {
    await runTask(taskId, "manual", async (text) => {
      sendTelegramMessage(text).catch((e: unknown) => {
        console.error("[/api/tasks/run] telegram error:", e);
      });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
