import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

process.env.PW_TEST_PROJECT_ROOT = path.resolve(process.cwd());

/** Required columns added in each schema version. Drop the DB if any are missing. */
const REQUIRED_TASK_COLS = new Set([
  "id", "name", "cron_expr", "command", "enabled", "created_at",
  "task_type", "task_config", // added for rednote support
]);

/**
 * Ensure automation.db has tasks + run_logs with all required columns.
 * Drops the DB if tables or columns are missing so drizzle-kit push recreates it.
 */
export default function globalSetup() {
  execSync("npm run db:push", { stdio: "inherit", cwd: process.cwd() });

  const autoPath = path.join(process.cwd(), "data", "automation.db");
  fs.mkdirSync(path.dirname(autoPath), { recursive: true });

  if (fs.existsSync(autoPath)) {
    const db = new Database(autoPath);
    const tableRows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tasks','run_logs')",
      )
      .all() as { name: string }[];
    const tableNames = new Set(tableRows.map((r) => r.name));

    let needsReset = !tableNames.has("tasks") || !tableNames.has("run_logs");

    if (!needsReset) {
      const colRows = db
        .prepare("PRAGMA table_info(tasks)")
        .all() as { name: string }[];
      const existingCols = new Set(colRows.map((c) => c.name));
      for (const col of REQUIRED_TASK_COLS) {
        if (!existingCols.has(col)) {
          needsReset = true;
          break;
        }
      }
    }

    db.close();
    if (needsReset) {
      fs.unlinkSync(autoPath);
    }
  }

  execSync("npm run automation:db:push", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

