#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var fmp_adapter_exports = {};
__export(fmp_adapter_exports, {
  FMPAdapter: () => FMPAdapter
});
module.exports = __toCommonJS(fmp_adapter_exports);
var import_axios = __toESM(require("axios"));
class FMPAdapter {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("FMP API key is required");
    }
    this.apiKey = apiKey;
    this.baseURL = "https://financialmodelingprep.com/api/v3";
    this.client = import_axios.default.create({
      baseURL: this.baseURL,
      timeout: 3e4,
      headers: {
        "Content-Type": "application/json"
      }
    });
    this.client.interceptors.request.use((config) => {
      config.params = {
        ...config.params,
        apikey: this.apiKey
      };
      return config;
    });
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          if (status === 429) {
            throw new Error("Rate limit exceeded. Please try again later.");
          } else if (status === 401) {
            throw new Error("Invalid API key. Please check your FMP_API_KEY environment variable.");
          } else if (status === 403) {
            throw new Error("Access forbidden. Your FMP API key may be invalid, expired, or you may have exceeded your plan limits. Please verify your API key at https://site.financialmodelingprep.com/developer/docs");
          } else if (status === 404) {
            throw new Error("Data not found for the requested ticker");
          }
          throw new Error(data?.message || `API error: ${status}`);
        }
        throw error;
      }
    );
  }
  async getCompanyProfile(ticker) {
    try {
      const response = await this.client.get(`/profile/${ticker.toUpperCase()}`);
      const data = response.data[0];
      if (!data)
        return null;
      return {
        symbol: data.symbol,
        companyName: data.companyName,
        exchange: data.exchange,
        exchangeShortName: data.exchangeShortName,
        industry: data.industry,
        sector: data.sector,
        country: data.country,
        currency: data.currency,
        marketCap: data.mktCap,
        employees: data.fullTimeEmployees,
        website: data.website,
        description: data.description,
        ceo: data.ceo,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        phone: data.phone,
        ipoDate: data.ipoDate
      };
    } catch (error) {
      console.error("Error fetching company profile:", error);
      throw error;
    }
  }
  async getQuote(ticker) {
    try {
      const response = await this.client.get(`/quote/${ticker.toUpperCase()}`);
      const data = response.data[0];
      if (!data)
        return null;
      return {
        symbol: data.symbol,
        price: data.price,
        changesPercentage: data.changesPercentage,
        change: data.change,
        dayLow: data.dayLow,
        dayHigh: data.dayHigh,
        yearHigh: data.yearHigh,
        yearLow: data.yearLow,
        marketCap: data.marketCap,
        priceAvg50: data.priceAvg50,
        priceAvg200: data.priceAvg200,
        volume: data.volume,
        avgVolume: data.avgVolume,
        exchange: data.exchange,
        open: data.open,
        previousClose: data.previousClose,
        eps: data.eps,
        pe: data.pe,
        sharesOutstanding: data.sharesOutstanding,
        timestamp: data.timestamp
      };
    } catch (error) {
      console.error("Error fetching quote:", error);
      throw error;
    }
  }
  async getIncomeStatements(ticker, limit = 5, period = "annual") {
    try {
      const response = await this.client.get(`/income-statement/${ticker.toUpperCase()}`, {
        params: { limit, period }
      });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching income statements:", error);
      throw error;
    }
  }
  async getBalanceSheets(ticker, limit = 5, period = "annual") {
    try {
      const response = await this.client.get(`/balance-sheet-statement/${ticker.toUpperCase()}`, {
        params: { limit, period }
      });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching balance sheets:", error);
      throw error;
    }
  }
  async getCashFlowStatements(ticker, limit = 5, period = "annual") {
    try {
      const response = await this.client.get(`/cash-flow-statement/${ticker.toUpperCase()}`, {
        params: { limit, period }
      });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching cash flow statements:", error);
      throw error;
    }
  }
  async getKeyMetrics(ticker, limit = 5, period = "annual") {
    try {
      const response = await this.client.get(`/key-metrics/${ticker.toUpperCase()}`, {
        params: { limit, period }
      });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching key metrics:", error);
      throw error;
    }
  }
  async getFinancialRatios(ticker, limit = 5, period = "annual") {
    try {
      const response = await this.client.get(`/ratios/${ticker.toUpperCase()}`, {
        params: { limit, period }
      });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching financial ratios:", error);
      throw error;
    }
  }
  async testConnection() {
    try {
      const response = await this.client.get("/stock-list");
      return Array.isArray(response.data) && response.data.length > 0;
    } catch (error) {
      console.error("FMP connection test failed:", error);
      return false;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FMPAdapter
});
