/**
 * HTTP client for the blog2media rednote API.
 * POST /api/rednote  { url }  →  string[]  (mdUrl + imageUrls)
 */
export class RednoteApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RednoteApiError";
  }
}

export async function callRednoteApi(articleUrl: string): Promise<string[]> {
  const baseUrl =
    (process.env.BLOG2MEDIA_BASE_URL ?? "http://127.0.0.1:9300").replace(
      /\/$/,
      "",
    );

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/rednote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: articleUrl }),
    });
  } catch (err) {
    throw new Error(
      `rednote network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // ignore json parse error
    }
    throw new RednoteApiError(res.status, `rednote API ${res.status}: ${detail}`);
  }

  return res.json() as Promise<string[]>;
}
