/**
 * rateLimiter.js
 *
 * Express middleware for defending against DDoS, brute-force, and scraping.
 *
 * ============================================================================
 * INTERN NOTES:
 * This file implements a "Token Bucket" algorithm.
 * 1. `windowMs`: The timeframe (e.g., 1000ms).
 * 2. `maxRequests`: How many tokens you get per timeframe.
 * 3. Every request costs 1 token. Tokens refill linearly over time.
 *
 * Notice that it uses `cacheAdapter.js` under the hood. This ensures that
 * when we scale to multiple servers, rate limits are globally enforced via Redis.
 * ============================================================================
 */
const { get, set } = require("../utils/cacheAdapter");

function createRateLimitMiddleware({ windowMs, maxRequests, keyGenerator }) {
  const refillRatePerMs = windowMs > 0 ? maxRequests / windowMs : maxRequests;

  return async (req, res, next) => {
    try {
      const key = typeof keyGenerator === "function"
        ? keyGenerator(req)
        : (() => {
            const forwardedFor = String(req.headers["x-forwarded-for"] || "");
            const sourceIp = forwardedFor.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
            return `ratelimit:${req.method}:${req.path}:${sourceIp}`;
          })();

      const now = Date.now();
      let bucket = await get(key);

      if (!bucket) {
        bucket = { tokens: maxRequests, last: now };
      }

      const elapsed = Math.max(0, now - bucket.last);
      if (elapsed > 0) {
        bucket.tokens = Math.min(maxRequests, bucket.tokens + elapsed * refillRatePerMs);
      }
      bucket.last = now;

      if (bucket.tokens < 1) {
        const missingTokens = 1 - bucket.tokens;
        const retryAfterMs = refillRatePerMs > 0
          ? Math.max(1, Math.ceil(missingTokens / refillRatePerMs))
          : windowMs || 1000;

        await set(key, bucket, windowMs * 2);

        res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
        return res.status(429).json({
          success: false,
          message: "Too many requests. Please try again later."
        });
      }

      bucket.tokens -= 1;
      await set(key, bucket, windowMs * 2);
      return next();
    } catch (err) {
      console.error("Rate limiter error", err);
      return next();
    }
  };
}

const authRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10
});

const sessionRateLimit = createRateLimitMiddleware({
  windowMs: 1000,
  maxRequests: 20,
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      return `session:${authHeader}`;
    }
    const forwardedFor = String(req.headers["x-forwarded-for"] || "");
    const sourceIp = forwardedFor.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    return `ip:${sourceIp}`;
  }
});

module.exports = {
  createRateLimitMiddleware,
  authRateLimit,
  sessionRateLimit
};
