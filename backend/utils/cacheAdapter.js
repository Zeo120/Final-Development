/**
 * cacheAdapter.js
 * 
 * Unified asynchronous storage adapter for horizontal scaling.
 * 
 * ============================================================================
 * INTERN NOTES:
 * Why do we need this file? 
 * Originally, our rate limiters and auth lockouts used `new Map()` to store data in memory.
 * But if we run 10 instances of this server (e.g. Kubernetes, AWS ECS), those Maps aren't shared! 
 * An attacker could hit server A, get locked out, then hit server B and bypass the lockout.
 * 
 * HOW TO SCALE TO 1000x WITHOUT REDIS:
 * Since we want to keep the stack 100% Vanilla (Node.js + SQL Server), if you deploy 
 * to a multi-instance cluster, you have two options to keep rate limits accurate:
 * 1. Load Balancer Sticky Sessions: Configure your load balancer to pin an IP address to a 
 *    specific instance. The local memoryStore will work perfectly.
 * 2. SQL Server Cache: Swap the `memoryStore` logic below to write/read from a dedicated 
 *    SQL Server table. Because all methods here are `async`, the rest of the app won't notice!
 * ============================================================================
 */

const memoryStore = new Map();

// Background cleanup for memory store (Not needed for Redis as Redis handles TTL automatically)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt && now > entry.expiresAt) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

async function get(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

async function set(key, value, ttlMs) {
  const expiresAt = ttlMs ? Date.now() + ttlMs : null;
  memoryStore.set(key, { value, expiresAt });
}

async function remove(key) {
  memoryStore.delete(key);
}

module.exports = {
  get,
  set,
  remove
};
