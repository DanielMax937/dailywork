"use client";

import { useState, useTransition } from "react";
import type { Task, RunLog } from "@/automation/db/schema";
import {
  addRednoteTask,
  addShellTask,
  toggleTask,
  deleteTask,
  runTaskNow,
  type ActionResult,
} from "@/actions/scheduled-tasks";

type TaskWithLog = Task & { lastRun: RunLog | null };

type AddFormType = "rednote" | "shell";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        ok
          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
          : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
      }`}
    >
      {ok ? "OK" : "FAIL"}
    </span>
  );
}

function TaskRow({
  task,
  onFeedback,
}: {
  task: TaskWithLog;
  onFeedback: (msg: string, ok: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handle = (action: (fd: FormData) => Promise<ActionResult>, fd: FormData) => {
    startTransition(async () => {
      const res = await action(fd);
      if (!res.ok) onFeedback(res.error, false);
      else if (res.message) onFeedback(res.message, true);
    });
  };

  const rednoteUrl = task.taskType === "rednote" && task.taskConfig
    ? (JSON.parse(task.taskConfig) as { url?: string }).url ?? ""
    : "";

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {task.name}
            </span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {task.taskType === "rednote" ? "rednote" : "shell"}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                task.enabled
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
              }`}
            >
              {task.enabled ? "enabled" : "disabled"}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="mr-3">cron: {task.cronExpr}</span>
            {task.taskType === "rednote" && rednoteUrl && (
              <span className="break-all">url: {rednoteUrl}</span>
            )}
            {task.taskType === "shell" && task.command && (
              <span className="break-all">cmd: {task.command}</span>
            )}
          </div>
          {task.lastRun && (
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
              <StatusBadge ok={task.lastRun.exitCode === 0} />
              <span>
                last run:{" "}
                {new Date(task.lastRun.finishedAt).toLocaleString()} (
                {task.lastRun.trigger})
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1">
          {/* Run Now */}
          <form
            action={(fd) => handle(runTaskNow, fd)}
          >
            <input type="hidden" name="id" value={task.id ?? ""} />
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              ▶ Run Now
            </button>
          </form>

          {/* Toggle */}
          <form action={(fd) => handle(toggleTask, fd)}>
            <input type="hidden" name="id" value={task.id ?? ""} />
            <button
              type="submit"
              disabled={isPending}
              className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {task.enabled ? "Disable" : "Enable"}
            </button>
          </form>

          {/* Delete */}
          <form action={(fd) => handle(deleteTask, fd)}>
            <input type="hidden" name="id" value={task.id ?? ""} />
            <button
              type="submit"
              disabled={isPending}
              className="rounded px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              Remove
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function AddTaskForm({ onFeedback }: { onFeedback: (msg: string, ok: boolean) => void }) {
  const [formType, setFormType] = useState<AddFormType>("rednote");
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const action = formType === "rednote" ? addRednoteTask : addShellTask;
      const res = await action(fd);
      if (res.ok) {
        form.reset();
        setOpen(false);
        onFeedback("Task added. Restart worker to apply schedule.", true);
      } else {
        onFeedback(res.error, false);
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500"
      >
        + Add Task
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {/* Type selector */}
      <div className="mb-3 flex gap-2">
        {(["rednote", "shell"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFormType(t)}
            className={`rounded px-3 py-1 text-xs font-medium ${
              formType === t
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {t === "rednote" ? "Rednote Task" : "Shell Task"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <input
          name="name"
          placeholder="Task name"
          required
          className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
        />
        <input
          name="cronExpr"
          placeholder="Cron expression (e.g. 0 9 * * 1-5)"
          required
          className="rounded border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
        />

        {formType === "rednote" ? (
          <input
            name="url"
            type="url"
            placeholder="Article URL to convert"
            required
            className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        ) : (
          <input
            name="command"
            placeholder="Shell command"
            required
            className="rounded border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {isPending ? "Adding…" : "Add Task"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

export default function TasksClient({ tasks }: { tasks: TaskWithLog[] }) {
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const handleFeedback = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 5000);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Scheduled Tasks</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage cron tasks. Results are sent via Telegram. Stored in{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
            data/automation.db
          </code>
          . Restart{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
            npm run worker
          </code>{" "}
          to apply schedule changes.
        </p>
      </header>

      {feedback && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            feedback.ok
              ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <AddTaskForm onFeedback={handleFeedback} />

      <ul className="flex flex-col gap-3">
        {tasks.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No tasks yet. Add one above.
          </li>
        ) : (
          tasks.map((t) => (
            <TaskRow key={t.id} task={t} onFeedback={handleFeedback} />
          ))
        )}
      </ul>
    </div>
  );
}
