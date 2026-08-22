// Simple in-memory rate limiting: fixed 60-second window, per endpoint + IP.
// Honest limitation: counters live only in the current process — they reset on
// server restart and are not shared across instances. Good enough for personal
// use on a single machine.

const WINDOW_MS = 60000;

const buckets = new Map();

export function checkRateLimit(req, scope, maxRequests) {
  // Prefer the socket address: this deployment has no reverse proxy, so
  // x-forwarded-for is client-controlled and could bypass limiting. XFF stays
  // only as a documented fallback.
  const rawIp =
    req.socket?.remoteAddress ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "unknown";
  const ip = rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;

  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (buckets.size > 1000) {
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k);
    }
  }

  if (bucket.count > maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
