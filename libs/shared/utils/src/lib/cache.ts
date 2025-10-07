import NodeCache = require('node-cache');

interface CacheConfig {
  stdTTL: number;
  checkperiod: number;
  useClones: boolean;
  maxKeys?: number;
}

export class CacheManager {
  private cache: NodeCache;
  private defaultTTL: number;
  private cacheTTLs: Map<string, number>;

  constructor(config?: Partial<CacheConfig>) {
    this.defaultTTL = config?.stdTTL || 300;

    this.cache = new NodeCache({
      stdTTL: this.defaultTTL,
      checkperiod: config?.checkperiod || 60,
      useClones: config?.useClones ?? true,
      maxKeys: config?.maxKeys || 1000,
    });

    this.cacheTTLs = new Map([
      ['profile', 86400],
      ['quote', 60],
      ['financials', 3600],
      ['income_statement', 3600],
      ['balance_sheet', 3600],
      ['cash_flow', 3600],
      ['ratios', 3600],
      ['key_metrics', 3600],
    ]);

    this.cache.on('expired', (key: string, value: any) => {
      console.error(`Cache expired for key: ${key}`);
    });

    this.cache.on('flush', () => {
      console.error('Cache flushed');
    });
  }

  generateKey(ticker: string, dataType: string, additionalParams?: Record<string, any>): string {
    const baseKey = `${ticker.toUpperCase()}:${dataType}`;

    if (additionalParams && Object.keys(additionalParams).length > 0) {
      const paramString = Object.entries(additionalParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join(':');
      return `${baseKey}:${paramString}`;
    }

    return baseKey;
  }

  get<T>(key: string): T | null {
    try {
      const value = this.cache.get<T>(key);
      if (value !== undefined) {
        console.error(`Cache hit for key: ${key}`);
        return value;
      }
      console.error(`Cache miss for key: ${key}`);
      return null;
    } catch (error) {
      console.error(`Error getting cache for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, dataType?: string): Promise<boolean> {
    try {
      const ttl = dataType ? this.cacheTTLs.get(dataType) || this.defaultTTL : this.defaultTTL;
      const success = this.cache.set(key, value, ttl);

      if (success) {
        console.error(`Cache set for key: ${key} with TTL: ${ttl}s`);
      }

      return success;
    } catch (error) {
      console.error(`Error setting cache for key ${key}:`, error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const count = this.cache.del(key);
      return count > 0;
    } catch (error) {
      console.error(`Error deleting cache for key ${key}:`, error);
      return false;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    try {
      const keys = this.cache.keys();
      const regex = new RegExp(pattern);
      const keysToDelete = keys.filter((key: string) => regex.test(key));

      if (keysToDelete.length > 0) {
        return this.cache.del(keysToDelete);
      }

      return 0;
    } catch (error) {
      console.error(`Error deleting cache by pattern ${pattern}:`, error);
      return 0;
    }
  }

  async flush(): Promise<void> {
    this.cache.flushAll();
  }

  getStats() {
    const stats = this.cache.getStats();
    const keys = this.cache.keys();

    return {
      keys: keys.length,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits / (stats.hits + stats.misses) || 0,
      ksize: stats.ksize,
      vsize: stats.vsize,
    };
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  getTTL(key: string): number | undefined {
    return this.cache.getTtl(key);
  }

  updateTTL(dataType: string, ttl: number): void {
    this.cacheTTLs.set(dataType, ttl);
  }
}
