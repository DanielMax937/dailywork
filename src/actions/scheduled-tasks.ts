"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getAutomationDb } from "@/automation/db";
import { tasks } from "@/automation/db/schema";
import { runTask } from "@/automation/runner";
import { sendTelegramMessage } from "@/lib/telegram-sender";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// ── Create ──────────────────────────────────────────────────────────────────

export async function addRednoteTask(formData: FormData): Promise<ActionResult> {
  const name = (formData.get("name") as string | null)?.trim();
  const cronExpr = (formData.get("cronExpr") as string | null)?.trim();
  const url = (formData.get("url") as string | null)?.trim();

  if (!name) return { ok: false, error: "name is required" };
  if (!cronExpr) return { ok: false, error: "cron expression is required" };
  if (!url) return { ok: false, error: "article URL is required" };

  // basic URL validation
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "invalid URL" };
  }

  try {
    const { assertValidCron } = await import("@/automation/cron-expr");
    assertValidCron(cronExpr);
  } catch (e) {
    return {
      ok: false,
      error: `invalid cron: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const db = getAutomationDb();
  await db.insert(tasks).values({
    name,
    cronExpr,
    taskType: "rednote",
    command: "",
    taskConfig: JSON.stringify({ url }),
    enabled: true,
  });

  revalidatePath("/tasks");
  return { ok: true };
}

export async function addShellTask(formData: FormData): Promise<ActionResult> {
  const name = (formData.get("name") as string | null)?.trim();
  const cronExpr = (formData.get("cronExpr") as string | null)?.trim();
  const command = (formData.get("command") as string | null)?.trim();

  if (!name) return { ok: false, error: "name is required" };
  if (!cronExpr) return { ok: false, error: "cron expression is required" };
  if (!command) return { ok: false, error: "command is required" };

  try {
    const { assertValidCron } = await import("@/automation/cron-expr");
    assertValidCron(cronExpr);
  } catch (e) {
    return {
      ok: false,
      error: `invalid cron: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const db = getAutomationDb();
  await db.insert(tasks).values({
    name,
    cronExpr,
    taskType: "shell",
    command,
    taskConfig: null,
    enabled: true,
  });

  revalidatePath("/tasks");
  return { ok: true };
}

// ── Toggle enable/disable ────────────────────────────────────────────────────

export async function toggleTask(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "missing id" };
  const idNum = Number.parseInt(id, 10);
  if (Number.isNaN(idNum)) return { ok: false, error: "invalid id" };

  const db = getAutomationDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, idNum));
  if (!row) return { ok: false, error: "task not found" };

  await db.update(tasks).set({ enabled: !row.enabled }).where(eq(tasks.id, idNum));
  revalidatePath("/tasks");
  return { ok: true };
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTask(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "missing id" };
  const idNum = Number.parseInt(id, 10);
  if (Number.isNaN(idNum)) return { ok: false, error: "invalid id" };

  const db = getAutomationDb();
  await db.delete(tasks).where(eq(tasks.id, idNum));
  revalidatePath("/tasks");
  return { ok: true };
}

// ── Manual run ───────────────────────────────────────────────────────────────

export async function runTaskNow(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "missing id" };
  const idNum = Number.parseInt(id, 10);
  if (Number.isNaN(idNum)) return { ok: false, error: "invalid id" };

  try {
    await runTask(idNum, "manual", async (text) => {
      // fire-and-forget; telegram failure should not fail the action
      sendTelegramMessage(text).catch((e: unknown) => {
        console.error("[runTaskNow] telegram send error:", e);
      });
    });
    revalidatePath("/tasks");
    return { ok: true, message: `Task ${idNum} triggered. Check Telegram for results.` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
