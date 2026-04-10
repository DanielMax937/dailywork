/**
 * One-off: strip JSON request body (-H Content-Type + -d) from rednote triggerCommand in automation.db.
 * Usage: npx tsx scripts/migrate-rednote-trigger-no-body.ts
 */
import { eq } from "drizzle-orm";
import { getAutomationDb } from "../src/automation/db";
import { tasks } from "../src/automation/db/schema";

function stripTriggerBody(cmd: string): string {
  let s = cmd.trim();
  s = s.replace(
    /\s+-H\s+'Content-Type:\s*application\/json'\s+-d\s+'[^']*'/g,
    "",
  );
  s = s.replace(
    /\s+-H\s+"Content-Type:\s*application\/json"\s+-d\s+"[^"]*"/g,
    "",
  );
  s = s.replace(/\s+-d\s+'[^']*'/g, "");
  s = s.replace(/\s+-d\s+"[^"]*"/g, "");
  return s.trim();
}

async function main(): Promise<void> {
  const db = getAutomationDb();
  const rows = await db.select().from(tasks).where(eq(tasks.taskType, "rednote"));
  let n = 0;
  for (const t of rows) {
    if (!t.taskConfig || t.id == null) continue;
    try {
      const cfg = JSON.parse(t.taskConfig) as { triggerCommand?: string };
      const tc = cfg.triggerCommand?.trim();
      if (!tc) continue;
      const next = stripTriggerBody(tc);
      if (next === tc) continue;
      cfg.triggerCommand = next;
      await db
        .update(tasks)
        .set({ taskConfig: JSON.stringify(cfg) })
        .where(eq(tasks.id, t.id));
      console.log(`updated task ${t.id} (${t.name})`);
      n += 1;
    } catch (e) {
      console.error(`skip task ${t.id}:`, e);
    }
  }
  console.log(n === 0 ? "no changes" : `done: ${n} task(s) updated`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
