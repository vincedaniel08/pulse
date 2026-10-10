// Fixed-window counter kept in process memory.
//
// ponytail: on serverless every warm instance has its own Map, so this slows
// a single abusive client down but is not a hard guarantee. The brief rules
// out external services; with one allowed, move this to Redis/Upstash or the
// Vercel firewall. Signals are limited per session in Postgres instead.

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    if (hits.size > 10_000) hits.clear(); // never grow without bound
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}

export function clientIp(request: Request): string {
  // Vercel sets x-forwarded-for; the first entry is the client.
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
