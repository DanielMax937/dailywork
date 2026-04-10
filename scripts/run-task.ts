/**
 * Direct task runner — bypasses the HTTP layer.
 * Usage: tsx scripts/run-task.ts <taskId>
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { runTask } from "../src/automation/runner";
import { sendTelegramMessage } from "../src/lib/telegram-sender";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

const taskId = Number(process.argv[2]);
if (!taskId || Number.isNaN(taskId)) {
  console.error("Usage: tsx scripts/run-task.ts <taskId>");
  process.exit(1);
}

async function main() {
  console.log(`[run-task] Starting task ${taskId}...`);

  const outcome = await runTask(taskId, "manual", async (text) => {
    console.log("\n[run-task] === TELEGRAM NOTIFICATION ===");
    console.log(text);
    console.log("[run-task] === END ===\n");
    try {
      await sendTelegramMessage(text);
      console.log("[run-task] ✅ Telegram message sent successfully");
    } catch (e) {
      console.error("[run-task] ❌ Telegram send failed:", e);
    }
  });
  if (outcome !== "ok") {
    console.error(`[run-task] ❌ ${outcome}`);
    process.exit(1);
  }
  console.log("[run-task] ✅ Task completed");
}

main().catch((e) => {
  console.error("[run-task] ❌ Fatal error:", e);
  process.exit(1);
});
