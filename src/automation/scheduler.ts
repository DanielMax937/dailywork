import { CronJob } from "cron";
import { eq } from "drizzle-orm";
import { automationDb as db } from "./db";
import { tasks } from "./db/schema";
import { assertValidCron, toCronTime } from "./cron-expr";

type RunFn = (taskId: number) => void | Promise<void>;

const jobs: CronJob[] = [];
const running = new Set<number>();

export function stopScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
}

export async function startScheduler(runTask: RunFn): Promise<void> {
  stopScheduler();

  const rows = await db.select().from(tasks).where(eq(tasks.enabled, true));

  for (const task of rows) {
    if (task.id == null) continue;
    try {
      assertValidCron(task.cronExpr);
      const cronTime = toCronTime(task.cronExpr);
      const id = task.id;
      const job = CronJob.from({
        cronTime,
        start: true,
        waitForCompletion: true,
        errorHandler: (err) => {
          console.error(`[cron] task ${id} ${task.name}:`, err);
        },
        onTick: async () => {
          if (running.has(id)) return;
          running.add(id);
          try {
            await runTask(id);
          } finally {
            running.delete(id);
          }
        },
      });
      jobs.push(job);
      console.log(`[cron] registered task ${id} "${task.name}" ${cronTime}`);
    } catch (e) {
      console.error(`[cron] skip task ${task.id} "${task.name}":`, e);
    }
  }
}
