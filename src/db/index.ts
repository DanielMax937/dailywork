import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

function projectRoot(): string {
  const r = process.env.PW_TEST_PROJECT_ROOT;
  if (typeof r === "string" && r.trim()) return r.trim();
  return process.cwd();
}

const globalForDb = globalThis as unknown as {
  todosqlite: Database.Database | undefined;
  tododrizzle: BetterSQLite3Database<typeof schema> | undefined;
};

function getSqlite(): Database.Database {
  if (!globalForDb.todosqlite) {
    const dbPath = path.join(projectRoot(), "data", "sqlite.db");
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    globalForDb.todosqlite = new Database(dbPath);
    globalForDb.todosqlite.pragma("foreign_keys = ON");
  }
  return globalForDb.todosqlite;
}

export function getDb() {
  if (!globalForDb.tododrizzle) {
    globalForDb.tododrizzle = drizzle(getSqlite(), { schema });
  }
  return globalForDb.tododrizzle;
}

