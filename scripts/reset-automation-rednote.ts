/**
 * Clears automation.db (tasks + run_logs) and inserts one rednote task.
 * Usage: npx tsx scripts/reset-automation-rednote.ts
 */
import { getAutomationDb } from "../src/automation/db";
import { runLogs, tasks } from "../src/automation/db/schema";

const taskConfig = {
  mode: "async" as const,
  triggerCommand: `curl -s -X POST http://127.0.0.1:9300/api/rednote`,
  pollCommandTemplate: `curl -s http://127.0.0.1:9300/api/rednote/{{jobId}}`,
};

async function main(): Promise<void> {
  const db = getAutomationDb();
  await db.delete(runLogs);
  await db.delete(tasks);

  await db.insert(tasks).values({
    name: "rednote-blog2media",
    cronExpr: "0 9 * * *",
    taskType: "rednote",
    command: "",
    taskConfig: JSON.stringify(taskConfig),
    enabled: true,
  });

  console.log(
    "OK: automation.db cleared; inserted rednote task (daily 09:00, trigger without body, blog2media :9300).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
