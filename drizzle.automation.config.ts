import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/automation/db/schema.ts",
  out: "./drizzle-automation",
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./data/automation.db",
  },
});
