import { Telegraf } from "telegraf";

export type TelegramDeps = {
  listTasksText: () => Promise<string>;
  runManual: (taskId: number) => Promise<void>;
};

export function attachTelegramHandlers(
  bot: Telegraf,
  allowedChatId: string,
  deps: TelegramDeps,
): void {
  bot.use(async (ctx, next) => {
    if (String(ctx.chat?.id) !== allowedChatId) return;
    await next();
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "Commands:",
        "/list — list scheduled tasks",
        "/run <id> — run a task now",
        "/help — this message",
      ].join("\n"),
    );
  });

  bot.command("list", async (ctx) => {
    try {
      const text = await deps.listTasksText();
      await ctx.reply(text);
    } catch (e) {
      console.error(e);
      await ctx.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  bot.command("run", async (ctx) => {
    const text =
      ctx.message && "text" in ctx.message ? ctx.message.text : "";
    const arg = text.trim().split(/\s+/)[1];
    const id = arg != null ? Number.parseInt(arg, 10) : Number.NaN;
    if (arg == null || Number.isNaN(id)) {
      await ctx.reply("Usage: /run <id> (use /list for ids)");
      return;
    }
    await ctx.reply(`Running task ${id}…`);
    try {
      await deps.runManual(id);
    } catch (e) {
      console.error(e);
      await ctx.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}
