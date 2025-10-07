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
var company_data_fetcher_exports = {};
__export(company_data_fetcher_exports, {
  CompanyDataFetcher: () => CompanyDataFetcher
});
module.exports = __toCommonJS(company_data_fetcher_exports);
var import_integrations = require("@stock-analyzer/mcp/integrations");
class CompanyDataFetcher {
  constructor(cacheManager, rateLimiter) {
    this.fmpAdapter = null;
    this.cacheManager = cacheManager;
    this.rateLimiter = rateLimiter;
  }
  ensureAdapter() {
    if (!this.fmpAdapter) {
      const apiKey = process.env["FMP_API_KEY"];
      if (!apiKey) {
        throw new Error("FMP_API_KEY environment variable is required");
      }
      this.fmpAdapter = new import_integrations.FMPAdapter(apiKey);
    }
    return this.fmpAdapter;
  }
  async fetchData(ticker, dataTypes = ["profile", "quote"], options = {}) {
    const { useCache = true, forceRefresh = false, limit = 5, period = "annual" } = options;
    ticker = ticker.toUpperCase();
    const result = {
      timestamp: /* @__PURE__ */ new Date()
    };
    const errors = [];
    for (const dataType of dataTypes) {
      try {
        const data = await this.fetchDataType(ticker, dataType, {
          useCache: useCache && !forceRefresh,
          limit,
          period
        });
        switch (dataType) {
          case "profile":
            result.profile = data;
            break;
          case "quote":
            result.quote = data;
            break;
          case "income_statement":
            if (!result.financials)
              result.financials = {};
            result.financials.incomeStatements = data;
            break;
          case "balance_sheet":
            if (!result.financials)
              result.financials = {};
            result.financials.balanceSheets = data;
            break;
          case "cash_flow":
            if (!result.financials)
              result.financials = {};
            result.financials.cashFlowStatements = data;
            break;
          case "financials":
            result.financials = await this.fetchAllFinancials(ticker, { useCache, limit, period });
            break;
          case "ratios":
            result.ratios = data;
            break;
          case "key_metrics":
            result.keyMetrics = data;
            break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to fetch ${dataType}: ${errorMessage}`);
        console.error(`Error fetching ${dataType} for ${ticker}:`, error);
      }
    }
    if (errors.length > 0 && Object.keys(result).length === 1) {
      throw new Error(`Failed to fetch data: ${errors.join("; ")}`);
    }
    return result;
  }
  async fetchDataType(ticker, dataType, options) {
    const { useCache = true, limit = 5, period = "annual" } = options;
    const cacheKey = this.cacheManager.generateKey(ticker, dataType, { limit, period });
    if (useCache) {
      const cachedData = await this.cacheManager.get(cacheKey);
      if (cachedData !== null) {
        return cachedData;
      }
    }
    const canProceed = await this.rateLimiter.waitForTokens("fmp_api", 1, 5e3);
    if (!canProceed) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    let data;
    const adapter = this.ensureAdapter();
    switch (dataType) {
      case "profile":
        data = await adapter.getCompanyProfile(ticker);
        break;
      case "quote":
        data = await adapter.getQuote(ticker);
        break;
      case "income_statement":
        data = await adapter.getIncomeStatements(ticker, limit, period);
        break;
      case "balance_sheet":
        data = await adapter.getBalanceSheets(ticker, limit, period);
        break;
      case "cash_flow":
        data = await adapter.getCashFlowStatements(ticker, limit, period);
        break;
      case "ratios":
        data = await adapter.getFinancialRatios(ticker, limit, period);
        break;
      case "key_metrics":
        data = await adapter.getKeyMetrics(ticker, limit, period);
        break;
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
    if (data !== null && data !== void 0) {
      await this.cacheManager.set(cacheKey, data, dataType);
    }
    return data;
  }
  async fetchAllFinancials(ticker, options) {
    const [incomeStatements, balanceSheets, cashFlowStatements] = await Promise.all([
      this.fetchDataType(ticker, "income_statement", options),
      this.fetchDataType(ticker, "balance_sheet", options),
      this.fetchDataType(ticker, "cash_flow", options)
    ]);
    return {
      incomeStatements,
      balanceSheets,
      cashFlowStatements
    };
  }
  async validateTicker(ticker) {
    try {
      const profile = await this.fetchDataType(ticker, "profile", { useCache: true });
      return profile !== null;
    } catch (error) {
      return false;
    }
  }
  async getCacheStats() {
    return this.cacheManager.getStats();
  }
  async getRateLimiterStats() {
    return this.rateLimiter.getStats();
  }
  async clearCache(ticker) {
    if (ticker) {
      const pattern = `^${ticker.toUpperCase()}:`;
      return await this.cacheManager.deleteByPattern(pattern);
    } else {
      await this.cacheManager.flush();
      return -1;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CompanyDataFetcher
});
