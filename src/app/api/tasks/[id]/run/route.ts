import { NextResponse } from "next/server";
import { runTask } from "@/automation/runner";
import { sendTelegramMessage } from "@/lib/telegram-sender";

/** Rednote / long shell jobs can exceed default serverless limits when deployed. */
export const maxDuration = 3600;

/**
 * POST /api/tasks/:id/run — **manual one-shot** run of the same task as cron (same `triggerCommand` / `command` from DB).
 * Path parameter **id** only; no request body. Shell env has HTTP(S)_PROXY stripped.
 */
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
    const outcome = await runTask(taskId, "manual", async (text) => {
      sendTelegramMessage(text).catch((e: unknown) => {
        console.error("[/api/tasks/run] telegram error:", e);
      });
    });
    if (outcome === "not_found") {
      return NextResponse.json({ error: "task not found" }, { status: 404 });
    }
    if (outcome === "skipped_disabled") {
      return NextResponse.json(
        { error: "task is disabled for non-manual triggers" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      taskId,
      mode: "once",
      note: "Single execution; same config as scheduled run; cron unchanged.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
