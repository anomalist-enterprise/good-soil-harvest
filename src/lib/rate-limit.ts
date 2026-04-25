import { dbFirst, dbRun, nowISO } from "@/lib/db";

// Simple DB-backed sliding-window rate limiter.
// Returns { ok: true } if request is allowed, or { ok: false, retryAfterSeconds }
// if the caller has exceeded the limit for this action+identifier.
//
// Works correctly across serverless invocations (unlike in-memory Maps)
// without needing Redis or external services. Fast enough for low-mid traffic
// — upgrade to Upstash Redis when traffic justifies it.
export async function rateLimit(opts: {
  action: string;           // e.g. "forgot-password", "register", "ai-search"
  identifier: string;       // e.g. user email, IP, user ID
  max: number;              // max requests per window
  windowSeconds: number;    // window length
}): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const key = `${opts.action}:${opts.identifier.toLowerCase()}`;
  const now = new Date();
  const windowMs = opts.windowSeconds * 1000;
  const windowCutoffISO = new Date(now.getTime() - windowMs).toISOString().replace("T", " ").slice(0, 19);

  const existing = await dbFirst<{ key: string; count: number; window_start: string }>(
    `SELECT key, count, window_start FROM rate_limits WHERE key = ?`,
    key,
  );

  // Compare window_start as-is; SQLite stores "YYYY-MM-DD HH:MM:SS" strings
  // that lexically sort the same way as Date order.
  if (!existing || existing.window_start < windowCutoffISO) {
    // No record, or old window expired — reset to 1
    await dbRun(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      key, nowISO(),
    );
    return { ok: true };
  }

  // Within the current window
  if (existing.count >= opts.max) {
    const windowStartMs = Date.parse(existing.window_start.replace(" ", "T") + "Z");
    const elapsed = now.getTime() - windowStartMs;
    const retryAfterSeconds = Math.ceil((windowMs - elapsed) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  await dbRun(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`, key);
  return { ok: true };
}

// Get a stable client identifier from the request.
// Prefers CF-Connecting-IP (Cloudflare) → X-Forwarded-For → X-Real-IP → "unknown"
export function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
