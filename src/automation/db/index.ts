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
  automationsqlite: Database.Database | undefined;
  automationdrizzle: BetterSQLite3Database<typeof schema> | undefined;
};

function getSqlite(): Database.Database {
  if (!globalForDb.automationsqlite) {
    const dbPath = path.join(projectRoot(), "data", "automation.db");
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    globalForDb.automationsqlite = new Database(dbPath);
    globalForDb.automationsqlite.pragma("foreign_keys = ON");
  }
  return globalForDb.automationsqlite;
}

export function getAutomationDb() {
  if (!globalForDb.automationdrizzle) {
    globalForDb.automationdrizzle = drizzle(getSqlite(), { schema });
  }
  return globalForDb.automationdrizzle;
}

