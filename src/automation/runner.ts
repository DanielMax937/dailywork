import { execaCommand } from "execa";
import { eq } from "drizzle-orm";
import { getAutomationDb } from "./db";
import { runLogs, tasks } from "./db/schema";
import { callRednoteApi } from "@/lib/rednote-client";

export type RunTrigger = "scheduled" | "manual";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [truncated ${s.length - max} chars]`;
}

function getTimeoutMs(): number {
  const sec = Number(process.env.AUTOMATION_DEFAULT_TIMEOUT_SEC ?? "3600");
  if (!Number.isFinite(sec) || sec <= 0) return 3600_000;
  return Math.floor(sec * 1000);
}

function getMaxLogChars(): number {
  const n = Number(process.env.AUTOMATION_LOG_MAX_CHARS ?? "8192");
  if (!Number.isFinite(n) || n < 256) return 8192;
  return Math.floor(n);
}

function formatNotify(params: {
  name: string;
  taskId: number;
  trigger: RunTrigger;
  exitCode: number;
  ok: boolean;
  stdout: string;
  stderr: string;
}): string {
  const status = params.ok ? "OK" : "FAIL";
  const lines = [
    `${status}: ${params.name} (id=${params.taskId})`,
    `trigger=${params.trigger} exit=${params.exitCode}`,
  ];
  if (params.stdout.trim()) lines.push(`stdout:\n${params.stdout}`);
  if (params.stderr.trim()) lines.push(`stderr:\n${params.stderr}`);
  let text = lines.join("\n\n");
  if (text.length > 4000) text = `${text.slice(0, 3990)}…`;
  return text;
}

function formatRednoteNotify(params: {
  name: string;
  taskId: number;
  trigger: RunTrigger;
  ok: boolean;
  urls?: string[];
  error?: string;
}): string {
  const status = params.ok ? "OK" : "FAIL";
  const lines = [
    `${status}: ${params.name} (id=${params.taskId}) [rednote]`,
    `trigger=${params.trigger}`,
  ];
  if (params.ok && params.urls?.length) {
    lines.push(`Generated ${params.urls.length} file(s):`);
    for (const u of params.urls) {
      lines.push(`• ${u}`);
    }
  }
  if (!params.ok && params.error) {
    lines.push(`error: ${params.error}`);
  }
  let text = lines.join("\n");
  if (text.length > 4000) text = `${text.slice(0, 3990)}…`;
  return text;
}

async function runShellTask(
  task: { id: number; name: string; command: string },
  trigger: RunTrigger,
  sendMessage: (text: string) => Promise<void>,
): Promise<void> {
  const maxChars = getMaxLogChars();
  const timeoutMs = getTimeoutMs();
  const startedAt = new Date();

  let exitCode = -1;
  let stdout = "";
  let stderr = "";
  let ok = false;

  try {
    const result = await execaCommand(task.command, {
      shell: true,
      timeout: timeoutMs,
      reject: false,
    });
    exitCode = result.exitCode ?? -1;
    stdout = truncate(String(result.stdout ?? ""), maxChars);
    stderr = truncate(String(result.stderr ?? ""), maxChars);
    ok = exitCode === 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr = truncate(`execa error: ${msg}`, maxChars);
    exitCode = -1;
    ok = false;
  }

  const finishedAt = new Date();
  const db = getAutomationDb();
  await db.insert(runLogs).values({
    taskId: task.id,
    startedAt,
    finishedAt,
    exitCode,
    stdout,
    stderr,
    trigger,
  });

  const text = formatNotify({
    name: task.name,
    taskId: task.id,
    trigger,
    exitCode,
    ok,
    stdout,
    stderr,
  });
  await sendMessage(text);
}

async function runRednoteTask(
  task: { id: number; name: string; taskConfig: string | null },
  trigger: RunTrigger,
  sendMessage: (text: string) => Promise<void>,
): Promise<void> {
  const startedAt = new Date();
  let exitCode = -1;
  let stdout = "";
  let stderr = "";
  let ok = false;

  let config: { url?: string };
  try {
    config = task.taskConfig ? (JSON.parse(task.taskConfig) as { url?: string }) : {};
  } catch {
    await sendMessage(
      `FAIL: ${task.name} (id=${task.id}) [rednote]\nbad taskConfig JSON`,
    );
    return;
  }

  if (!config.url) {
    await sendMessage(
      `FAIL: ${task.name} (id=${task.id}) [rednote]\nmissing url in taskConfig`,
    );
    return;
  }

  let urls: string[] | undefined;
  let errorMsg: string | undefined;

  try {
    urls = await callRednoteApi(config.url);
    stdout = JSON.stringify(urls);
    exitCode = 0;
    ok = true;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    stderr = errorMsg;
    exitCode = -1;
    ok = false;
  }

  const finishedAt = new Date();
  const db = getAutomationDb();
  await db.insert(runLogs).values({
    taskId: task.id,
    startedAt,
    finishedAt,
    exitCode,
    stdout,
    stderr,
    trigger,
  });

  const text = formatRednoteNotify({
    name: task.name,
    taskId: task.id,
    trigger,
    ok,
    urls,
    error: errorMsg,
  });
  await sendMessage(text);
}

export async function runTask(
  taskId: number,
  trigger: RunTrigger,
  sendMessage: (text: string) => Promise<void>,
): Promise<void> {
  const db = getAutomationDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) {
    await sendMessage(`Task id ${taskId} not found.`);
    return;
  }
  if (!task.enabled) {
    await sendMessage(`Task "${task.name}" (id=${taskId}) is disabled.`);
    return;
  }

  if (task.taskType === "rednote") {
    await runRednoteTask(task, trigger, sendMessage);
  } else {
    await runShellTask(task, trigger, sendMessage);
  }
}

