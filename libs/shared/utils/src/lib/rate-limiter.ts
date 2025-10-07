interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

interface RateLimiterConfig {
  capacity?: number;
  refillRate?: number;
  checkInterval?: number;
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket>;
  private defaultCapacity: number;
  private defaultRefillRate: number;
  private checkInterval: NodeJS.Timeout | null;

  constructor(config?: RateLimiterConfig) {
    this.buckets = new Map();
    this.defaultCapacity = config?.capacity || 100;
    this.defaultRefillRate = config?.refillRate || 10;
    this.checkInterval = null;

    if (config?.checkInterval) {
      this.startCleanupInterval(config.checkInterval);
    }
  }

  private createBucket(capacity?: number, refillRate?: number): TokenBucket {
    return {
      tokens: capacity || this.defaultCapacity,
      lastRefill: Date.now(),
      capacity: capacity || this.defaultCapacity,
      refillRate: refillRate || this.defaultRefillRate,
    };
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(timePassed * bucket.refillRate);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  async checkLimit(
    identifier: string,
    tokensRequired: number = 1,
    capacity?: number,
    refillRate?: number
  ): Promise<boolean> {
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

  async waitForTokens(
    identifier: string,
    tokensRequired: number = 1,
    maxWaitTime: number = 30000,
    capacity?: number,
    refillRate?: number
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      if (await this.checkLimit(identifier, tokensRequired, capacity, refillRate)) {
        return true;
      }

      const bucket = this.buckets.get(identifier)!;
      const tokensNeeded = tokensRequired - bucket.tokens;
      const timeToWait = Math.ceil((tokensNeeded / bucket.refillRate) * 1000);

      if (timeToWait + (Date.now() - startTime) > maxWaitTime) {
        break;
      }

      await this.sleep(Math.min(timeToWait, 1000));
    }

    return false;
  }

  getRemainingTokens(identifier: string): number {
    const bucket = this.buckets.get(identifier);

    if (!bucket) {
      return this.defaultCapacity;
    }

    this.refillBucket(bucket);
    return bucket.tokens;
  }

  getTimeUntilRefill(identifier: string, tokensNeeded: number): number {
    const bucket = this.buckets.get(identifier);

    if (!bucket) {
      return 0;
    }

    this.refillBucket(bucket);

    if (bucket.tokens >= tokensNeeded) {
      return 0;
    }

    const tokensRequired = tokensNeeded - bucket.tokens;
    return Math.ceil((tokensRequired / bucket.refillRate) * 1000);
  }

  reset(identifier: string): void {
    const bucket = this.buckets.get(identifier);

    if (bucket) {
      bucket.tokens = bucket.capacity;
      bucket.lastRefill = Date.now();
    }
  }

  resetAll(): void {
    for (const [, bucket] of this.buckets) {
      bucket.tokens = bucket.capacity;
      bucket.lastRefill = Date.now();
    }
  }

  remove(identifier: string): boolean {
    return this.buckets.delete(identifier);
  }

  private startCleanupInterval(intervalMs: number): void {
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 3600000;

      for (const [identifier, bucket] of this.buckets) {
        if (now - bucket.lastRefill > staleThreshold) {
          this.buckets.delete(identifier);
        }
      }
    }, intervalMs);
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.buckets.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    const stats = {
      totalBuckets: this.buckets.size,
      buckets: [] as Array<{
        identifier: string;
        tokens: number;
        capacity: number;
        refillRate: number;
      }>,
    };

    for (const [identifier, bucket] of this.buckets) {
      this.refillBucket(bucket);
      stats.buckets.push({
        identifier,
        tokens: bucket.tokens,
        capacity: bucket.capacity,
        refillRate: bucket.refillRate,
      });
    }

    return stats;
  }
}
