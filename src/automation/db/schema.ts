import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  cronExpr: text("cron_expr").notNull(),
  command: text("command").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const runLogs = sqliteTable("run_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }).notNull(),
  exitCode: integer("exit_code").notNull(),
  stdout: text("stdout").notNull(),
  stderr: text("stderr").notNull(),
  trigger: text("trigger").notNull(), // "scheduled" | "manual"
});

export type Task = typeof tasks.$inferSelect;
export type RunLog = typeof runLogs.$inferSelect;
