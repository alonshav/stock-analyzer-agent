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
var cache_exports = {};
__export(cache_exports, {
  CacheManager: () => CacheManager
});
module.exports = __toCommonJS(cache_exports);
const NodeCache = require("node-cache");
class CacheManager {
  constructor(config) {
    this.defaultTTL = config?.stdTTL || 300;
    this.cache = new NodeCache({
      stdTTL: this.defaultTTL,
      checkperiod: config?.checkperiod || 60,
      useClones: config?.useClones ?? true,
      maxKeys: config?.maxKeys || 1e3
    });
    this.cacheTTLs = /* @__PURE__ */ new Map([
      ["profile", 86400],
      ["quote", 60],
      ["financials", 3600],
      ["income_statement", 3600],
      ["balance_sheet", 3600],
      ["cash_flow", 3600],
      ["ratios", 3600],
      ["key_metrics", 3600]
    ]);
    this.cache.on("expired", (key, value) => {
      console.error(`Cache expired for key: ${key}`);
    });
    this.cache.on("flush", () => {
      console.error("Cache flushed");
    });
  }
  generateKey(ticker, dataType, additionalParams) {
    const baseKey = `${ticker.toUpperCase()}:${dataType}`;
    if (additionalParams && Object.keys(additionalParams).length > 0) {
      const paramString = Object.entries(additionalParams).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}:${value}`).join(":");
      return `${baseKey}:${paramString}`;
    }
    return baseKey;
  }
  get(key) {
    try {
      const value = this.cache.get(key);
      if (value !== void 0) {
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
  async set(key, value, dataType) {
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
  async delete(key) {
    try {
      const count = this.cache.del(key);
      return count > 0;
    } catch (error) {
      console.error(`Error deleting cache for key ${key}:`, error);
      return false;
    }
  }
  async deleteByPattern(pattern) {
    try {
      const keys = this.cache.keys();
      const regex = new RegExp(pattern);
      const keysToDelete = keys.filter((key) => regex.test(key));
      if (keysToDelete.length > 0) {
        return this.cache.del(keysToDelete);
      }
      return 0;
    } catch (error) {
      console.error(`Error deleting cache by pattern ${pattern}:`, error);
      return 0;
    }
  }
  async flush() {
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
      vsize: stats.vsize
    };
  }
  async has(key) {
    return this.cache.has(key);
  }
  getTTL(key) {
    return this.cache.getTtl(key);
  }
  updateTTL(dataType, ttl) {
    this.cacheTTLs.set(dataType, ttl);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CacheManager
});
