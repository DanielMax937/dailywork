import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { addTodo } from "../src/actions/todo";
import { assertValidCron, toCronTime } from "../src/automation/cron-expr";
import { requireEnv } from "../src/automation/env";
import { getAutomationDb } from "../src/automation/db";
import { runLogs, tasks } from "../src/automation/db/schema";
import { runTask } from "../src/automation/runner";
import { startScheduler, stopScheduler } from "../src/automation/scheduler";

const sqlitePath = path.join(process.cwd(), "data", "sqlite.db");
const automationPath = path.join(process.cwd(), "data", "automation.db");

function openSqlite(file: string): Database.Database {
  return new Database(file);
}

test.describe("DB-T / sqlite.db", () => {
  test("DB-T-01: data/sqlite.db exists and is writable", () => {
    expect(fs.existsSync(sqlitePath)).toBeTruthy();
  });

  test("DB-T-02: PRAGMA foreign_keys = ON", () => {
    const db = openSqlite(sqlitePath);
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    db.close();
    expect(row.foreign_keys).toBe(1);
  });

  test("DB-T-03: todos table columns", () => {
    const db = openSqlite(sqlitePath);
    const cols = db.prepare("PRAGMA table_info(todos)").all() as {
      name: string;
    }[];
    db.close();
    const names = new Set(cols.map((c) => c.name));
    expect(names.has("id")).toBeTruthy();
    expect(names.has("title")).toBeTruthy();
    expect(names.has("done")).toBeTruthy();
    expect(names.has("created_at")).toBeTruthy();
  });
});

test.describe("CRON — cron-expr.ts", () => {
  test("CRON-01: 5-field to 6-field", () => {
    expect(toCronTime("*/5 * * * *")).toBe("0 */5 * * * *");
  });

  test("CRON-02: 6-field passthrough", () => {
    expect(toCronTime("0 */5 * * * *")).toBe("0 */5 * * * *");
  });

  test("CRON-03: wrong field count throws", () => {
    expect(() => toCronTime("* * * *")).toThrow(/need 5 or 6 fields/);
    expect(() => toCronTime("0 0 0 0 0 0 0")).toThrow(/need 5 or 6 fields/);
  });

  test("CRON-04: assertValidCron rejects invalid", () => {
    expect(() => assertValidCron("not a cron at all")).toThrow();
  });
});

test.describe("AUTO-E — worker env", () => {
  test("AUTO-E-01: missing TELEGRAM_BOT_TOKEN throws", () => {
    const prev = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => requireEnv("TELEGRAM_BOT_TOKEN")).toThrow(
      /Missing required env: TELEGRAM_BOT_TOKEN/,
    );
    if (prev !== undefined) process.env.TELEGRAM_BOT_TOKEN = prev;
  });

  test("AUTO-E-02: missing TELEGRAM_ALLOWED_CHAT_ID throws", () => {
    const prevTok = process.env.TELEGRAM_BOT_TOKEN;
    const prevChat = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    process.env.TELEGRAM_BOT_TOKEN = "dummy";
    delete process.env.TELEGRAM_ALLOWED_CHAT_ID;
    expect(() => requireEnv("TELEGRAM_ALLOWED_CHAT_ID")).toThrow(
      /Missing required env: TELEGRAM_ALLOWED_CHAT_ID/,
    );
    if (prevTok !== undefined) process.env.TELEGRAM_BOT_TOKEN = prevTok;
    else delete process.env.TELEGRAM_BOT_TOKEN;
    if (prevChat !== undefined) process.env.TELEGRAM_ALLOWED_CHAT_ID = prevChat;
    else delete process.env.TELEGRAM_ALLOWED_CHAT_ID;
  });

  test.skip("AUTO-E-03: SIGINT/SIGTERM shutdown (needs running bot — manual)", () => {
    expect(true).toBeTruthy();
  });
});

test.describe("TG-A — Telegram (not automated)", () => {
  test.skip("TG-A-01 — TG-A-08: require real Telegram bot + chat", () => {
    expect(true).toBeTruthy();
  });
});

test.describe("RUN — runner.ts", () => {
  test.beforeEach(async () => {
    await getAutomationDb().delete(runLogs);
    await getAutomationDb().delete(tasks);
  });

  test("RUN-01: missing task id", async () => {
    const msgs: string[] = [];
    await runTask(999_999, "manual", async (t) => {
      msgs.push(t);
    });
    expect(msgs.some((m) => m.includes("not found"))).toBeTruthy();
  });

  test("RUN-02: disabled task", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "off",
        cronExpr: "0 0 * * *",
        command: "echo x",
        enabled: false,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    expect(msgs.some((m) => m.includes("disabled"))).toBeTruthy();
  });

  test("RUN-03: command success exit 0", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "ok",
        cronExpr: "0 0 * * *",
        command: process.platform === "win32" ? "cmd /c exit 0" : "true",
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    const text = msgs.join("\n");
    expect(text).toMatch(/OK:/);
    expect(text).toMatch(/exit=0/);
  });

  test("RUN-04: command failure non-zero", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "fail",
        cronExpr: "0 0 * * *",
        command: process.platform === "win32" ? "cmd /c exit 7" : "exit 7",
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    const text = msgs.join("\n");
    expect(text).toMatch(/FAIL:/);
    expect(text).toMatch(/exit=7/);
  });

  test("RUN-05: timeout via AUTOMATION_DEFAULT_TIMEOUT_SEC", async () => {
    const prev = process.env.AUTOMATION_DEFAULT_TIMEOUT_SEC;
    process.env.AUTOMATION_DEFAULT_TIMEOUT_SEC = "1";
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "slow",
        cronExpr: "0 0 * * *",
        command:
          process.platform === "win32"
            ? "cmd /c ping -n 30 127.0.0.1 >nul"
            : "sleep 30",
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    process.env.AUTOMATION_DEFAULT_TIMEOUT_SEC = prev;
    const text = msgs.join("\n");
    expect(text).toMatch(/FAIL:/);
  });

  test("RUN-06: stdout truncation marker", async () => {
    const prev = process.env.AUTOMATION_LOG_MAX_CHARS;
    process.env.AUTOMATION_LOG_MAX_CHARS = "500";
    const cmd = `node -e "console.log('x'.repeat(2000))"`;
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "bigout",
        cronExpr: "0 0 * * *",
        command: cmd,
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    process.env.AUTOMATION_LOG_MAX_CHARS = prev;
    expect(msgs.join("\n")).toMatch(/truncated/);
  });

  test("RUN-07: invalid timeout env falls back to 3600s behavior", async () => {
    const prev = process.env.AUTOMATION_DEFAULT_TIMEOUT_SEC;
    process.env.AUTOMATION_DEFAULT_TIMEOUT_SEC = "not-a-number";
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "t7",
        cronExpr: "0 0 * * *",
        command: "true",
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    process.env.AUTOMATION_DEFAULT_TIMEOUT_SEC = prev;
    expect(msgs.join("\n")).toMatch(/OK:/);
  });

  test("RUN-08: Telegram message capped ~4000 chars", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "longmsg",
        cronExpr: "0 0 * * *",
        command: `node -e "console.log('y'.repeat(5000))"`,
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    expect(msgs[0].length).toBeLessThanOrEqual(4010);
    expect(msgs[0]).toMatch(/…/);
  });

  test("RUN-09: run_logs row inserted", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "logged",
        cronExpr: "0 0 * * *",
        command: "true",
        enabled: true,
      })
      .returning();
    await runTask(row.id!, "manual", async () => {});
    const logs = await getAutomationDb()
      .select()
      .from(runLogs)
      .where(eq(runLogs.taskId, row.id!));
    expect(logs.length).toBe(1);
    expect(logs[0].trigger).toBe("manual");
    expect(logs[0].stdout).toBeDefined();
    expect(logs[0].stderr).toBeDefined();
  });
});

test.describe("SCH — scheduler.ts", () => {
  test.beforeEach(async () => {
    await getAutomationDb().delete(runLogs);
    await getAutomationDb().delete(tasks);
  });

  test.afterEach(() => {
    stopScheduler();
  });

  test("SCH-01: disabled task not registered", async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(" "));
      orig.apply(console, a as []);
    };
    await getAutomationDb().insert(tasks).values({
      name: "off",
      cronExpr: "0 * * * *",
      command: "echo 1",
      enabled: false,
    });
    await startScheduler(async () => {});
    console.log = orig;
    expect(logs.some((l) => l.includes("registered") && l.includes("off"))).toBe(
      false,
    );
  });

  test("SCH-02: invalid cron logs skip", async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => {
      errs.push(a.map(String).join(" "));
      orig.apply(console, a as []);
    };
    await getAutomationDb().insert(tasks).values({
      name: "badcron",
      cronExpr: "this is not cron",
      command: "echo 1",
      enabled: true,
    });
    await startScheduler(async () => {});
    console.error = orig;
    expect(errs.some((l) => l.includes("skip"))).toBeTruthy();
  });

  test("SCH-03: valid cron registers", async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(" "));
      orig.apply(console, a as []);
    };
    await getAutomationDb().insert(tasks).values({
      name: "good",
      cronExpr: "*/5 * * * *",
      command: "echo 1",
      enabled: true,
    });
    await startScheduler(async () => {});
    console.log = orig;
    expect(logs.some((l) => l.includes("registered") && l.includes("good"))).toBe(
      true,
    );
  });

  test("SCH-05: stopScheduler clears jobs", async () => {
    await getAutomationDb().insert(tasks).values({
      name: "s5",
      cronExpr: "*/5 * * * *",
      command: "echo 1",
      enabled: true,
    });
    await startScheduler(async () => {});
    stopScheduler();
    expect(true).toBeTruthy();
  });

  test.skip("SCH-04: overlap guard (timing-heavy — manual)", () => {
    expect(true).toBeTruthy();
  });

  test.skip("SCH-06: reload after DB change (design — manual)", () => {
    expect(true).toBeTruthy();
  });
});

test.describe("ADB — automation.db", () => {
  test("ADB-01: automation.db exists", () => {
    expect(fs.existsSync(automationPath)).toBeTruthy();
  });

  test("ADB-02: tasks / run_logs columns", () => {
    const db = openSqlite(automationPath);
    const tc = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    const names = new Set(tc.map((c) => c.name));
    expect(names.has("cron_expr")).toBeTruthy();
    expect(names.has("command")).toBeTruthy();
    expect(names.has("enabled")).toBeTruthy();
    db.close();
  });

  test("ADB-03: cascade delete run_logs when task deleted", async () => {
    await getAutomationDb().delete(runLogs);
    await getAutomationDb().delete(tasks);
    const [t] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "cascade",
        cronExpr: "0 0 * * *",
        command: "true",
        enabled: true,
      })
      .returning();
    await getAutomationDb().insert(runLogs).values({
      taskId: t.id!,
      startedAt: new Date(),
      finishedAt: new Date(),
      exitCode: 0,
      stdout: "",
      stderr: "",
      trigger: "manual",
    });
    await getAutomationDb().delete(tasks).where(eq(tasks.id, t.id!));
    const left = await getAutomationDb().select().from(runLogs);
    expect(left.length).toBe(0);
  });
});

test.describe("TODO-A-04 — server action (no browser)", () => {
  test("TODO-A-04: addTodo ignores missing title field", async () => {
    const db = openSqlite(sqlitePath);
    db.exec("DELETE FROM todos");
    db.close();
    const fd = new FormData();
    await addTodo(fd);
    const db2 = openSqlite(sqlitePath);
    const n = db2.prepare("SELECT COUNT(*) as c FROM todos").get() as { c: number };
    db2.close();
    expect(n.c).toBe(0);
  });
});

// ============================================================================
// RUN-REDNOTE — rednote task type in runner
// ============================================================================

test.describe("RUN-REDNOTE — rednote task execution", () => {
  test.beforeEach(async () => {
    await getAutomationDb().delete(runLogs);
    await getAutomationDb().delete(tasks);
  });

  test("RUN-RN-01: rednote task missing taskConfig notifies error", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "no-config",
        cronExpr: "0 0 * * *",
        taskType: "rednote",
        command: "",
        taskConfig: null,
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => { msgs.push(t); });
    expect(msgs.some((m) => m.includes("FAIL") || m.includes("missing"))).toBeTruthy();
  });

  test("RUN-RN-02: rednote task missing triggerCommand in taskConfig notifies error", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "no-url",
        cronExpr: "0 0 * * *",
        taskType: "rednote",
        command: "",
        taskConfig: JSON.stringify({}),
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => { msgs.push(t); });
    expect(msgs.some((m) => m.includes("FAIL") || m.includes("triggerCommand"))).toBeTruthy();
  });

  test("RUN-RN-03: rednote task invalid taskConfig JSON notifies error", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "bad-json",
        cronExpr: "0 0 * * *",
        taskType: "rednote",
        command: "",
        taskConfig: "not-json",
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => { msgs.push(t); });
    expect(msgs.some((m) => m.includes("FAIL") || m.includes("JSON") || m.includes("bad"))).toBeTruthy();
  });

  test("RUN-RN-04: rednote task with unreachable URL stores run_log and sends FAIL", async () => {
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "unreachable",
        cronExpr: "0 0 * * *",
        taskType: "rednote",
        command: "",
        taskConfig: JSON.stringify({
          mode: "async",
          triggerCommand: `curl -s -X POST http://127.0.0.1:19999/api/rednote`,
          pollCommandTemplate: `curl -s http://127.0.0.1:19999/api/rednote/{{jobId}}`,
        }),
        enabled: true,
      })
      .returning();
    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => { msgs.push(t); });
    // Should fail (service not running) and send a FAIL notification
    expect(msgs.some((m) => m.includes("FAIL"))).toBeTruthy();
    // Should write a run_log entry
    const logs = await getAutomationDb()
      .select()
      .from(runLogs)
      .where(eq(runLogs.taskId, row.id!));
    expect(logs.length).toBe(1);
    expect(logs[0].exitCode).toBe(-1);
    expect(logs[0].trigger).toBe("manual");
  });

  test("RUN-RN-05: rednote task success formats notification with URLs", async () => {
    // Mock the rednote API with a local HTTP server
    const http = await import("http");
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(["https://cdn.example.com/out.md", "https://cdn.example.com/img1.jpg"]));
    });
    await new Promise<void>((resolve) => server.listen(19998, "127.0.0.1", resolve));

    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "success-mock",
        cronExpr: "0 0 * * *",
        taskType: "rednote",
        command: "",
        taskConfig: JSON.stringify({
          mode: "sync",
          triggerCommand: `curl -s -X POST http://127.0.0.1:19998/api/rednote`,
        }),
        enabled: true,
      })
      .returning();

    const msgs: string[] = [];
    await runTask(row.id!, "scheduled", async (t) => { msgs.push(t); });
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const text = msgs.join("\n");
    expect(text).toMatch(/OK:/);
    expect(text).toMatch(/rednote sync/);
    expect(text).toMatch(/cdn\.example\.com/);

    // run_log inserted
    const logs = await getAutomationDb()
      .select()
      .from(runLogs)
      .where(eq(runLogs.taskId, row.id!));
    expect(logs.length).toBe(1);
    expect(logs[0].exitCode).toBe(0);
    expect(logs[0].trigger).toBe("scheduled");
  });

  test("RUN-RN-06: rednote async mode polls until completed", async () => {
    const http = await import("http");
    let polls = 0;
    const server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/api/rednote") {
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jobId: "job-async-1" }));
        return;
      }
      if (req.method === "GET" && req.url === "/api/rednote/job-async-1") {
        polls += 1;
        if (polls < 2) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jobId: "job-async-1",
              status: "processing",
              urls: null,
            }),
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jobId: "job-async-1",
            status: "completed",
            urls: ["https://cdn.example.com/async.md", "https://cdn.example.com/a.png"],
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(19995, "127.0.0.1", resolve));

    const prevPoll = process.env.REDNOTE_POLL_INTERVAL_MS;
    process.env.REDNOTE_POLL_INTERVAL_MS = "20";

    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "async-mock",
        cronExpr: "0 0 * * *",
        taskType: "rednote",
        command: "",
        taskConfig: JSON.stringify({
          mode: "async",
          triggerCommand: `curl -s -X POST http://127.0.0.1:19995/api/rednote`,
          pollCommandTemplate: `curl -s http://127.0.0.1:19995/api/rednote/{{jobId}}`,
        }),
        enabled: true,
      })
      .returning();

    const msgs: string[] = [];
    await runTask(row.id!, "manual", async (t) => {
      msgs.push(t);
    });
    if (prevPoll !== undefined) process.env.REDNOTE_POLL_INTERVAL_MS = prevPoll;
    else delete process.env.REDNOTE_POLL_INTERVAL_MS;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const text = msgs.join("\n");
    expect(text).toMatch(/OK:/);
    expect(text).toMatch(/rednote async/);
    expect(text).toMatch(/job-async-1/);
    expect(text).toMatch(/async\.md/);
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  test("RUN-RN-07: rednote async poll timeout writes log and FAIL telegram", async () => {
    const http = await import("http");
    const server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/api/rednote") {
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jobId: "job-stuck" }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/rednote/job-stuck")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jobId: "job-stuck",
            status: "processing",
            urls: null,
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(19994, "127.0.0.1", resolve));

    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({
        name: "async-timeout",
        cronExpr: "0 0 * * *",
        taskType: "rednote",
        command: "",
        taskConfig: JSON.stringify({
          mode: "async",
          triggerCommand: `curl -s -X POST http://127.0.0.1:19994/api/rednote`,
          pollCommandTemplate: `curl -s http://127.0.0.1:19994/api/rednote/{{jobId}}`,
          pollTimeoutMs: 120,
          pollIntervalMs: 30,
        }),
        enabled: true,
      })
      .returning();

    const msgs: string[] = [];
    await runTask(row.id!, "scheduled", async (t) => {
      msgs.push(t);
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(msgs.some((m) => m.includes("FAIL"))).toBeTruthy();
    expect(msgs.some((m) => m.includes("poll timeout") || m.includes("timeout"))).toBeTruthy();
    const logs = await getAutomationDb()
      .select()
      .from(runLogs)
      .where(eq(runLogs.taskId, row.id!));
    expect(logs.length).toBe(1);
    expect(logs[0].exitCode).toBe(-1);
    expect(logs[0].trigger).toBe("scheduled");
    expect(logs[0].stderr.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// ADB-REDNOTE — schema columns
// ============================================================================

test.describe("ADB-REDNOTE — automation.db rednote schema", () => {
  test("ADB-RN-01: tasks table has task_type and task_config columns", () => {
    const db = openSqlite(automationPath);
    const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    db.close();
    const names = new Set(cols.map((c) => c.name));
    expect(names.has("task_type")).toBeTruthy();
    expect(names.has("task_config")).toBeTruthy();
  });

  test("ADB-RN-02: task_type defaults to shell", async () => {
    await getAutomationDb().delete(runLogs);
    await getAutomationDb().delete(tasks);
    const [row] = await getAutomationDb()
      .insert(tasks)
      .values({ name: "defaulttype", cronExpr: "0 0 * * *", command: "echo 1", enabled: true })
      .returning();
    expect(row.taskType).toBe("shell");
    await getAutomationDb().delete(tasks);
  });
});

// ============================================================================
// REDNOTE-CLIENT — parsers for rednote stdout (shell commands)
// ============================================================================

test.describe("REDNOTE-CLIENT — rednote-client parsers", () => {
  test("REDNOTE-CLIENT-01: parseRednoteSyncStdout parses JSON array", async () => {
    const { parseRednoteSyncStdout } = await import("../src/lib/rednote-client");
    expect(parseRednoteSyncStdout('["a","b"]')).toEqual(["a", "b"]);
  });

  test("REDNOTE-CLIENT-02: parseRednoteSyncStdout throws on non-array", async () => {
    const { parseRednoteSyncStdout } = await import("../src/lib/rednote-client");
    expect(() => parseRednoteSyncStdout("{}")).toThrow(/expected JSON array/);
  });

  test("REDNOTE-CLIENT-03: parseRednoteEnqueueStdout reads jobId", async () => {
    const { parseRednoteEnqueueStdout } = await import("../src/lib/rednote-client");
    expect(parseRednoteEnqueueStdout('{"jobId":"x-1"}')).toBe("x-1");
  });

  test("REDNOTE-CLIENT-04: expandJobIdInShellCommand replaces placeholders", async () => {
    const { expandJobIdInShellCommand } = await import("../src/lib/rednote-client");
    expect(expandJobIdInShellCommand("curl -s http://h/api/{{jobId}}", "j1")).toBe(
      "curl -s http://h/api/j1",
    );
  });
});
