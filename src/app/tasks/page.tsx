import { desc } from "drizzle-orm";
import { getAutomationDb } from "@/automation/db";
import { tasks, runLogs } from "@/automation/db/schema";
import { eq } from "drizzle-orm";
import TasksClient from "./TasksClient";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const db = getAutomationDb();
  const taskList = await db.select().from(tasks).orderBy(desc(tasks.id));

  // Fetch the latest run log for each task
  const lastRuns = await Promise.all(
    taskList.map(async (t) => {
      const [log] = await db
        .select()
        .from(runLogs)
        .where(eq(runLogs.taskId, t.id!))
        .orderBy(desc(runLogs.id))
        .limit(1);
      return { taskId: t.id!, log: log ?? null };
    }),
  );

  const lastRunMap = Object.fromEntries(
    lastRuns.map(({ taskId, log }) => [taskId, log]),
  );

  const tasksWithLogs = taskList.map((t) => ({
    ...t,
    lastRun: lastRunMap[t.id!] ?? null,
  }));

  return <TasksClient tasks={tasksWithLogs} />;
}
