/**
 * Env keys that steer HTTP clients (curl, wget, etc.) / child processes through a proxy.
 * Stripping them is equivalent to `unset` before the command — the subprocess never
 * sees these variables (unlike a login shell that might re-export them).
 */
const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "FTP_PROXY",
  "ftp_proxy",
  "SOCKS_PROXY",
  "socks_proxy",
  "RSYNC_PROXY",
  "rsync_proxy",
] as const;

/** Copy of `base` env without proxy variables (for execa/spawn). */
export function stripProxyFromEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base };
  for (const k of PROXY_ENV_KEYS) {
    delete out[k];
  }
  return out;
}
