export function createLimiter() {
  const buckets = new Map();
  return {
    allow(key, limit, windowMs, now = Date.now()) {
      const fresh = (buckets.get(key) || []).filter((stamp) => now - stamp < windowMs);
      if (fresh.length >= limit) {
        buckets.set(key, fresh);
        return false;
      }
      fresh.push(now);
      buckets.set(key, fresh);
      if (buckets.size > 2000) {
        for (const old of [...buckets.keys()].slice(0, 1000)) buckets.delete(old);
      }
      return true;
    },
  };
}
