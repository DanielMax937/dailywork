import { validateCronExpression } from "cron";

/**
 * User supplies standard 5-field crontab (minute hour dom month dow). The `cron`
 * package uses 6 fields with seconds first — prepend `0`.
 */
export function toCronTime(expr: string): string {
  const trimmed = expr.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 5) return `0 ${trimmed}`;
  if (parts.length === 6) return trimmed;
  throw new Error(
    `Invalid cron expr (need 5 or 6 fields): ${expr}`,
  );
}

export function assertValidCron(expr: string): void {
  const cronTime = toCronTime(expr);
  const v = validateCronExpression(cronTime);
  if (!v.valid) {
    const detail = v.error != null ? String(v.error) : "unknown";
    throw new Error(`Invalid cron: ${expr} (${detail})`);
  }
}
