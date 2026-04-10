/**
 * Helpers for rednote tasks that run **shell commands** (e.g. `curl`) configured per task.
 *
 * - **Sync**: trigger command prints JSON `string[]` (HTTP 200 body) to stdout.
 * - **Async**: trigger prints `{ "jobId": "..." }`; poll command uses `{{jobId}}` / `{jobId}`
 *   and prints `{ jobId, status, urls?, error? }` until `completed` | `failed` | poll timeout.
 *
 * Timeouts: `REDNOTE_*` env or optional fields in `taskConfig` (see runner).
 */

export class RednotePollTimeoutError extends Error {
  constructor(
    message: string,
    public readonly jobId?: string,
  ) {
    super(message);
    this.name = "RednotePollTimeoutError";
  }
}

export type RednoteJobPollBody = {
  jobId: string;
  status: string;
  error?: string | null;
  urls?: string[] | null;
};

/** Replace `{{jobId}}` / `{jobId}` in a full shell command string (e.g. curl URL). */
export function expandJobIdInShellCommand(template: string, jobId: string): string {
  return template
    .replace(/\{\{jobId\}\}/g, jobId)
    .replace(/\{jobId\}/g, jobId);
}

/** Sync: stdout must be a JSON array of URL strings. */
export function parseRednoteSyncStdout(stdout: string): string[] {
  const trimmed = stdout.trim();
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch {
    throw new Error("rednote sync: stdout is not valid JSON");
  }
  if (!Array.isArray(body)) {
    throw new Error("rednote sync: expected JSON array of URLs in stdout");
  }
  return body as string[];
}

/** Async enqueue: stdout must be JSON with `jobId`. */
export function parseRednoteEnqueueStdout(stdout: string): string {
  const trimmed = stdout.trim();
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch {
    throw new Error("rednote async: enqueue stdout is not valid JSON");
  }
  const obj = body as { jobId?: string };
  if (!obj.jobId || typeof obj.jobId !== "string") {
    throw new Error("rednote async: enqueue response missing jobId in stdout");
  }
  return obj.jobId;
}

/** One poll step: JSON body with `status` (blog2media-style). */
export function parseRednotePollStdout(stdout: string): RednoteJobPollBody {
  const trimmed = stdout.trim();
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch {
    throw new Error("rednote async: poll stdout is not valid JSON");
  }
  const row = body as RednoteJobPollBody;
  if (!row || typeof row !== "object") {
    throw new Error("rednote async: poll response is not an object");
  }
  if (!row.jobId || typeof row.jobId !== "string") {
    throw new Error("rednote async: poll response missing jobId");
  }
  if (!row.status || typeof row.status !== "string") {
    throw new Error("rednote async: poll response missing status");
  }
  return row;
}
