import "dotenv/config";
import { asc } from "drizzle-orm";
import { Telegraf } from "telegraf";
import { ProxyAgent } from "undici";
import { requireEnv } from "./env";
import { attachTelegramHandlers } from "./telegram";
import { getAutomationDb } from "./db";
import { tasks } from "./db/schema";
import { runTask } from "./runner";
import { startScheduler, stopScheduler } from "./scheduler";

function buildTelegrafAgent(): ProxyAgent | undefined {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;
  if (!proxyUrl) return undefined;
  console.log(`[worker] Telegram via proxy: ${proxyUrl}`);
  return new ProxyAgent(proxyUrl);
}

async function listTasksText(): Promise<string> {
  const db = getAutomationDb();
  const rows = await db.select().from(tasks).orderBy(asc(tasks.id));
  if (rows.length === 0) {
    return "No tasks. Use the web UI at http://localhost:3000/tasks to add tasks.";
  }
  const lines = rows.map((t) => {
    const on = t.enabled ? "on" : "off";
    const typeLabel = t.taskType === "rednote" ? "[rednote]" : "[shell]";
    const detail =
      t.taskType === "rednote"
        ? `url: ${(JSON.parse(t.taskConfig ?? "{}") as { url?: string }).url ?? "(none)"}`
        : `cmd: ${t.command}`;
    return `${t.id}. ${t.name} ${typeLabel} [${on}]\ncron: ${t.cronExpr}\n${detail}`;
  });
  return lines.join("\n\n");
}

async function main(): Promise<void> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const allowedChatId = requireEnv("TELEGRAM_ALLOWED_CHAT_ID");

  const agent = buildTelegrafAgent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bot = new Telegraf(token, { telegram: { agent: agent as any } });

  const sendMessage = async (text: string): Promise<void> => {
    await bot.telegram.sendMessage(allowedChatId, text);
  };

  attachTelegramHandlers(bot, allowedChatId, {
    listTasksText,
    runManual: async (taskId: number) => {
      await runTask(taskId, "manual", sendMessage);
    },
  });

  await startScheduler((taskId: number) =>
    runTask(taskId, "scheduled", sendMessage),
  );

  await bot.launch();
  console.log("[worker] Telegram bot running. Press Ctrl+C to stop.");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal}, stopping…`);
    stopScheduler();
    await bot.stop(signal);
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
