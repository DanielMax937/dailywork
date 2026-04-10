import { execaCommand } from "execa";
import { eq } from "drizzle-orm";
import { getAutomationDb } from "./db";
import { runLogs, tasks } from "./db/schema";
import {
  expandJobIdInShellCommand,
  parseRednoteEnqueueStdout,
  parseRednotePollStdout,
  parseRednoteSyncStdout,
  RednotePollTimeoutError,
} from "@/lib/rednote-client";
import { stripProxyFromEnv } from "@/lib/no-proxy-env";

export type RunTrigger = "scheduled" | "manual";

/** `runTask` result: `not_found` / `skipped_disabled` still notify via Telegram callback. */
export type RunTaskOutcome = "ok" | "not_found" | "skipped_disabled";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runShellCommandRaw(
  cmd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const maxChars = getMaxLogChars();
  try {
    const result = await execaCommand(cmd, {
      shell: true,
      timeout: timeoutMs,
      reject: false,
      env: stripProxyFromEnv(),
    });
    return {
      exitCode: result.exitCode ?? -1,
      stdout: truncate(String(result.stdout ?? ""), maxChars),
      stderr: truncate(String(result.stderr ?? ""), maxChars),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { exitCode: -1, stdout: "", stderr: truncate(`execa error: ${msg}`, maxChars) };
  }
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
  mode: "sync" | "async";
  urls?: string[];
  jobId?: string;
  error?: string;
}): string {
  const status = params.ok ? "OK" : "FAIL";
  const lines = [
    `${status}: ${params.name} (id=${params.taskId}) [rednote ${params.mode}]`,
    `trigger=${params.trigger}`,
  ];
  if (params.jobId) lines.push(`jobId=${params.jobId}`);
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
  const timeoutMs = getTimeoutMs();
  const startedAt = new Date();

  let exitCode = -1;
  let stdout = "";
  let stderr = "";
  let ok = false;

  const result = await runShellCommandRaw(task.command, timeoutMs);
  exitCode = result.exitCode;
  stdout = result.stdout;
  stderr = result.stderr;
  ok = exitCode === 0;

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

type RednoteTaskConfigJson = {
  mode?: "sync" | "async";
  /** Full shell command for the HTTP trigger (no request body). Same for cron and manual. */
  triggerCommand?: string;
  /** Async: shell command template with `{{jobId}}` or `{jobId}` for each poll. */
  pollCommandTemplate?: string;
  syncTimeoutMs?: number;
  asyncPostTimeoutMs?: number;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
};

function rednoteEnvNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function runRednoteAsyncCommands(params: {
  triggerCommand: string;
  pollCommandTemplate: string;
  asyncPostTimeoutMs: number;
  pollTimeoutMs: number;
  pollIntervalMs: number;
}): Promise<{ jobId: string; urls: string[]; logStdout: string }> {
  const { triggerCommand, pollCommandTemplate, asyncPostTimeoutMs, pollTimeoutMs, pollIntervalMs } =
    params;

  const post = await runShellCommandRaw(triggerCommand, asyncPostTimeoutMs);
  if (post.exitCode !== 0) {
    throw new Error(
      `rednote async: trigger command failed (exit ${post.exitCode})${post.stderr ? ` | ${post.stderr}` : ""}`,
    );
  }

  const jobId = parseRednoteEnqueueStdout(post.stdout);
  const pollStarted = Date.now();

  for (;;) {
    const elapsed = Date.now() - pollStarted;
    if (elapsed >= pollTimeoutMs) {
      throw new RednotePollTimeoutError(
        `rednote poll timeout after ${pollTimeoutMs}ms (jobId=${jobId})`,
        jobId,
      );
    }

    const remaining = pollTimeoutMs - elapsed;
    const pollCmd = expandJobIdInShellCommand(pollCommandTemplate, jobId);
    const getTimeout = Math.min(120_000, Math.max(1_000, remaining));

    const poll = await runShellCommandRaw(pollCmd, getTimeout);
    if (poll.exitCode !== 0) {
      throw new Error(
        `rednote async: poll command failed (exit ${poll.exitCode})${poll.stderr ? ` | ${poll.stderr}` : ""}`,
      );
    }

    const row = parseRednotePollStdout(poll.stdout);

    if (row.status === "completed") {
      const urls = row.urls;
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        throw new Error("rednote async: completed job missing urls");
      }
      return {
        jobId,
        urls,
        logStdout: JSON.stringify({ jobId, urls }),
      };
    }

    if (row.status === "failed") {
      const msg = row.error?.trim() || "rednote job failed";
      throw new Error(msg);
    }

    if (row.status !== "queued" && row.status !== "processing") {
      throw new Error(`rednote async: unknown status ${row.status}`);
    }

    const sleepMs = Math.min(pollIntervalMs, pollTimeoutMs - (Date.now() - pollStarted));
    if (sleepMs <= 0) {
      throw new RednotePollTimeoutError(
        `rednote poll timeout after ${pollTimeoutMs}ms (jobId=${jobId})`,
        jobId,
      );
    }
    await sleep(sleepMs);
  }
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

  if (!task.taskConfig?.trim()) {
    await sendMessage(
      `FAIL: ${task.name} (id=${task.id}) [rednote]\nmissing taskConfig`,
    );
    return;
  }

  let config: RednoteTaskConfigJson;
  try {
    config = JSON.parse(task.taskConfig) as RednoteTaskConfigJson;
  } catch {
    await sendMessage(
      `FAIL: ${task.name} (id=${task.id}) [rednote]\nbad taskConfig JSON`,
    );
    return;
  }

  const triggerCommand = config.triggerCommand?.trim();
  if (!triggerCommand) {
    await sendMessage(
      `FAIL: ${task.name} (id=${task.id}) [rednote]\nmissing triggerCommand in taskConfig`,
    );
    return;
  }

  const mode: "sync" | "async" = config.mode === "sync" ? "sync" : "async";
  const pollTemplate = config.pollCommandTemplate?.trim();

  if (mode === "async" && !pollTemplate) {
    await sendMessage(
      `FAIL: ${task.name} (id=${task.id}) [rednote]\nmissing pollCommandTemplate for async mode`,
    );
    return;
  }

  const syncTimeoutMs =
    config.syncTimeoutMs ?? rednoteEnvNum("REDNOTE_SYNC_TIMEOUT_MS", 600_000);
  const asyncPostTimeoutMs =
    config.asyncPostTimeoutMs ?? rednoteEnvNum("REDNOTE_ASYNC_POST_TIMEOUT_MS", 180_000);
  const pollTimeoutMs =
    config.pollTimeoutMs ?? rednoteEnvNum("REDNOTE_POLL_TIMEOUT_MS", 3_600_000);
  const pollIntervalMs =
    config.pollIntervalMs ?? rednoteEnvNum("REDNOTE_POLL_INTERVAL_MS", 5_000);

  let urls: string[] | undefined;
  let errorMsg: string | undefined;
  let jobId: string | undefined;

  try {
    if (mode === "sync") {
      const result = await runShellCommandRaw(triggerCommand, syncTimeoutMs);
      if (result.exitCode !== 0) {
        throw new Error(
          `rednote sync: trigger command failed (exit ${result.exitCode})${result.stderr ? ` | ${result.stderr}` : ""}`,
        );
      }
      urls = parseRednoteSyncStdout(result.stdout);
      stdout = result.stdout.trim();
      exitCode = 0;
      ok = true;
    } else {
      const result = await runRednoteAsyncCommands({
        triggerCommand,
        pollCommandTemplate: pollTemplate!,
        asyncPostTimeoutMs,
        pollTimeoutMs,
        pollIntervalMs,
      });
      urls = result.urls;
      jobId = result.jobId;
      stdout = result.logStdout;
      exitCode = 0;
      ok = true;
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    stderr = errorMsg;
    if (err instanceof RednotePollTimeoutError && err.jobId) {
      jobId = err.jobId;
    }
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
    mode,
    urls,
    jobId,
    error: errorMsg,
  });
  await sendMessage(text);
}

export async function runTask(
  taskId: number,
  trigger: RunTrigger,
  sendMessage: (text: string) => Promise<void>,
): Promise<RunTaskOutcome> {
  const db = getAutomationDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) {
    await sendMessage(`Task id ${taskId} not found.`);
    return "not_found";
  }
  // Cron only runs enabled tasks; manual API / Telegram / Run Now may still fire once.
  if (!task.enabled && trigger !== "manual") {
    await sendMessage(`Task "${task.name}" (id=${taskId}) is disabled.`);
    return "skipped_disabled";
  }

  if (task.taskType === "rednote") {
    await runRednoteTask(task, trigger, sendMessage);
  } else {
    await runShellTask(task, trigger, sendMessage);
  }
  return "ok";
}

