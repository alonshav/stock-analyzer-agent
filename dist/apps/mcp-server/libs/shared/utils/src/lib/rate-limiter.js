#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var rate_limiter_exports = {};
__export(rate_limiter_exports, {
  RateLimiter: () => RateLimiter
});
module.exports = __toCommonJS(rate_limiter_exports);
class RateLimiter {
  constructor(config) {
    this.buckets = /* @__PURE__ */ new Map();
    this.defaultCapacity = config?.capacity || 100;
    this.defaultRefillRate = config?.refillRate || 10;
    this.checkInterval = null;
    if (config?.checkInterval) {
      this.startCleanupInterval(config.checkInterval);
    }
  }
  createBucket(capacity, refillRate) {
    return {
      tokens: capacity || this.defaultCapacity,
      lastRefill: Date.now(),
      capacity: capacity || this.defaultCapacity,
      refillRate: refillRate || this.defaultRefillRate
    };
  }
  refillBucket(bucket) {
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1e3;
    const tokensToAdd = Math.floor(timePassed * bucket.refillRate);
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }
  async checkLimit(identifier, tokensRequired = 1, capacity, refillRate) {
    let bucket = this.buckets.get(identifier);
    if (!bucket) {
      bucket = this.createBucket(capacity, refillRate);
      this.buckets.set(identifier, bucket);
    }
    this.refillBucket(bucket);
    if (bucket.tokens >= tokensRequired) {
      bucket.tokens -= tokensRequired;
      return true;
    }
    return false;
  }
  async waitForTokens(identifier, tokensRequired = 1, maxWaitTime = 3e4, capacity, refillRate) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      if (await this.checkLimit(identifier, tokensRequired, capacity, refillRate)) {
        return true;
      }
      const bucket = this.buckets.get(identifier);
      const tokensNeeded = tokensRequired - bucket.tokens;
      const timeToWait = Math.ceil(tokensNeeded / bucket.refillRate * 1e3);
      if (timeToWait + (Date.now() - startTime) > maxWaitTime) {
        break;
      }
      await this.sleep(Math.min(timeToWait, 1e3));
    }
    return false;
  }
  getRemainingTokens(identifier) {
    const bucket = this.buckets.get(identifier);
    if (!bucket) {
      return this.defaultCapacity;
    }
    this.refillBucket(bucket);
    return bucket.tokens;
  }
  getTimeUntilRefill(identifier, tokensNeeded) {
    const bucket = this.buckets.get(identifier);
    if (!bucket) {
      return 0;
    }
    this.refillBucket(bucket);
    if (bucket.tokens >= tokensNeeded) {
      return 0;
    }
    const tokensRequired = tokensNeeded - bucket.tokens;
    return Math.ceil(tokensRequired / bucket.refillRate * 1e3);
  }
  reset(identifier) {
    const bucket = this.buckets.get(identifier);
    if (bucket) {
      bucket.tokens = bucket.capacity;
      bucket.lastRefill = Date.now();
    }
  }
  resetAll() {
    for (const [, bucket] of this.buckets) {
      bucket.tokens = bucket.capacity;
      bucket.lastRefill = Date.now();
    }
  }
  remove(identifier) {
    return this.buckets.delete(identifier);
  }
  startCleanupInterval(intervalMs) {
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 36e5;
      for (const [identifier, bucket] of this.buckets) {
        if (now - bucket.lastRefill > staleThreshold) {
          this.buckets.delete(identifier);
        }
      }
    }, intervalMs);
  }
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.buckets.clear();
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  getStats() {
    const stats = {
      totalBuckets: this.buckets.size,
      buckets: []
    };
    for (const [identifier, bucket] of this.buckets) {
      this.refillBucket(bucket);
      stats.buckets.push({
        identifier,
        tokens: bucket.tokens,
        capacity: bucket.capacity,
        refillRate: bucket.refillRate
      });
    }
    return stats;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RateLimiter
});
