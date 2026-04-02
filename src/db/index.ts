import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = path.join(process.cwd(), "data", "sqlite.db");

const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
  drizzle: BetterSQLite3Database<typeof schema> | undefined;
};

function getSqlite(): Database.Database {
  if (!globalForDb.sqlite) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    globalForDb.sqlite = new Database(dbPath);
    globalForDb.sqlite.pragma("foreign_keys = ON");
  }
  return globalForDb.sqlite;
}

export function getDb() {
  if (!globalForDb.drizzle) {
    globalForDb.drizzle = drizzle(getSqlite(), { schema });
  }
  return globalForDb.drizzle;
}

export const db = getDb();
