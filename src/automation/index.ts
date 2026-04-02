import "dotenv/config";
import { asc } from "drizzle-orm";
import { Telegraf } from "telegraf";
import { attachTelegramHandlers } from "./telegram";
import { automationDb as db } from "./db";
import { tasks } from "./db/schema";
import { runTask } from "./runner";
import { startScheduler, stopScheduler } from "./scheduler";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v.trim();
}

async function listTasksText(): Promise<string> {
  const rows = await db.select().from(tasks).orderBy(asc(tasks.id));
  if (rows.length === 0) {
    return "No tasks. Insert rows into automation.db (tasks table), then restart worker.";
  }
  const lines = rows.map((t) => {
    const on = t.enabled ? "on" : "off";
    return `${t.id}. ${t.name} [${on}]\ncron: ${t.cronExpr}\ncmd: ${t.command}`;
  });
  return lines.join("\n\n");
}

async function main(): Promise<void> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const allowedChatId = requireEnv("TELEGRAM_ALLOWED_CHAT_ID");

  const bot = new Telegraf(token);

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
