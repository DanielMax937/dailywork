/**
 * Standalone Telegram message sender with optional HTTP proxy support.
 * Works in both the automation worker and Next.js server context.
 *
 * Env vars consumed:
 *   TELEGRAM_BOT_TOKEN       – required
 *   TELEGRAM_ALLOWED_CHAT_ID – required (recipient chat id)
 *   HTTPS_PROXY / HTTP_PROXY – optional proxy URL e.g. http://127.0.0.1:7890
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    undefined
  );
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim();

  if (!token) throw new Error("Missing env: TELEGRAM_BOT_TOKEN");
  if (!chatId) throw new Error("Missing env: TELEGRAM_ALLOWED_CHAT_ID");

  const proxyUrl = getProxyUrl();
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;

  const fetchOptions: Parameters<typeof undiciFetch>[1] = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    ...(dispatcher ? { dispatcher } : {}),
  };

  const res = await undiciFetch(apiUrl, fetchOptions);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram API ${res.status}: ${body}`);
  }
}
