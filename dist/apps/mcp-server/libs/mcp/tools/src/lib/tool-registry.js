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
var tool_registry_exports = {};
__export(tool_registry_exports, {
  ToolRegistry: () => ToolRegistry,
  createToolRegistry: () => createToolRegistry,
  getToolsRegistry: () => getToolsRegistry
});
module.exports = __toCommonJS(tool_registry_exports);
var import_company_data_fetcher = require("./data-fetching/company-data-fetcher");
var import_dcf_calculator = require("./dcf/dcf-calculator");
var import_utils = require("@stock-analyzer/shared/utils");
class ToolRegistry {
  constructor(cacheManager, rateLimiter) {
    this.cacheManager = cacheManager;
    this.rateLimiter = rateLimiter;
    this.companyDataFetcher = new import_company_data_fetcher.CompanyDataFetcher(cacheManager, rateLimiter);
    this.dcfCalculator = new import_dcf_calculator.DCFCalculator();
  }
  /**
   * Get all available tools as MCP Tool definitions
   */
  getTools() {
    return [
      {
        name: "fetch_company_data",
        description: "Fetch comprehensive financial data for a company from Financial Modeling Prep API",
        inputSchema: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Stock ticker symbol (e.g., AAPL, GOOGL)"
            },
            dataTypes: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "profile",
                  "financials",
                  "income_statement",
                  "balance_sheet",
                  "cash_flow",
                  "ratios",
                  "key_metrics",
                  "quote"
                ]
              },
              description: "Types of data to fetch",
              default: ["profile", "quote"]
            },
            period: {
              type: "string",
              enum: ["annual", "quarter"],
              description: "Period type: annual for yearly data, quarter for quarterly data",
              default: "quarter"
            },
            limit: {
              type: "number",
              minimum: 1,
              maximum: 20,
              description: "Number of periods to fetch (1-20)",
              default: 5
            }
          },
          required: ["ticker"]
        }
      },
      {
        name: "calculate_dcf",
        description: "Calculate DCF (Discounted Cash Flow) valuation using provided projections and assumptions. Returns enterprise value, equity value, and fair value per share.",
        inputSchema: {
          type: "object",
          properties: {
            projectedFreeCashFlows: {
              type: "array",
              items: { type: "number" },
              description: "Array of projected free cash flows for each year (in USD)"
            },
            terminalGrowthRate: {
              type: "number",
              description: "Terminal growth rate (e.g., 0.025 for 2.5%)"
            },
            discountRate: {
              type: "number",
              description: "WACC/discount rate (e.g., 0.10 for 10%)"
            },
            netDebt: {
              type: "number",
              description: "Net debt (total debt minus cash) in USD"
            },
            sharesOutstanding: {
              type: "number",
              description: "Diluted shares outstanding"
            },
            currentRevenue: {
              type: "number",
              description: "Optional: Current year revenue for context"
            },
            projectedRevenues: {
              type: "array",
              items: { type: "number" },
              description: "Optional: Array of projected revenues corresponding to FCF projections"
            },
            assumptions: {
              type: "object",
              description: "Optional: Additional assumptions and context for reference",
              properties: {
                projectionYears: { type: "number" },
                baseYear: { type: "string" }
              }
            }
          },
          required: ["projectedFreeCashFlows", "terminalGrowthRate", "discountRate", "netDebt", "sharesOutstanding"]
        }
      },
      {
        name: "test_api_connection",
        description: "Test if the FMP API key is valid and working. Returns connection status.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ];
  }
  /**
   * Execute a tool by name with given arguments
   */
  async executeTool(name, args) {
    switch (name) {
      case "fetch_company_data":
        return await this.handleFetchCompanyData(args);
      case "calculate_dcf":
        return await this.handleCalculateDCF(args);
      case "test_api_connection":
        return await this.handleTestApiConnection();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  async handleFetchCompanyData(args) {
    const { ticker, dataTypes, period = "quarter", limit = 5 } = args;
    if (!ticker) {
      throw new Error("Ticker symbol is required");
    }
    const options = { period, limit };
    const data = await this.companyDataFetcher.fetchData(ticker, dataTypes, options);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
  async handleCalculateDCF(args) {
    const {
      projectedFreeCashFlows,
      terminalGrowthRate,
      discountRate,
      netDebt,
      sharesOutstanding,
      currentRevenue,
      projectedRevenues,
      assumptions
    } = args;
    if (!projectedFreeCashFlows || !Array.isArray(projectedFreeCashFlows)) {
      throw new Error("projectedFreeCashFlows array is required for DCF analysis");
    }
    if (typeof terminalGrowthRate !== "number") {
      throw new Error("terminalGrowthRate is required for DCF analysis");
    }
    if (typeof discountRate !== "number") {
      throw new Error("discountRate is required for DCF analysis");
    }
    if (typeof netDebt !== "number") {
      throw new Error("netDebt is required for DCF analysis");
    }
    if (typeof sharesOutstanding !== "number") {
      throw new Error("sharesOutstanding is required for DCF analysis");
    }
    try {
      const dcfResults = this.dcfCalculator.calculateDCF({
        projectedFreeCashFlows,
        terminalGrowthRate,
        discountRate,
        netDebt,
        sharesOutstanding,
        currentRevenue,
        projectedRevenues,
        assumptions
      });
      const formattedResults = this.dcfCalculator.formatResults(dcfResults);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              dcfResults,
              formattedAnalysis: formattedResults
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error in DCF calculation";
      throw new Error(`DCF calculation failed: ${errorMessage}`);
    }
  }
  async handleTestApiConnection() {
    try {
      const apiKey = process.env["FMP_API_KEY"];
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: FMP_API_KEY environment variable is not set. Please add it to your environment configuration."
            }
          ]
        };
      }
      await this.companyDataFetcher.fetchData("AAPL", ["quote"]);
      return {
        content: [
          {
            type: "text",
            text: `\u2705 API connection successful!
API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}
Test data retrieved for AAPL.`
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: `\u274C API connection failed!
${errorMessage}

Please check:
1. Your FMP_API_KEY is correct
2. You have an active FMP subscription
3. Your API limits haven't been exceeded`
          }
        ]
      };
    }
  }
  /**
   * Get company data fetcher instance (for direct use in Agent)
   */
  getCompanyDataFetcher() {
    return this.companyDataFetcher;
  }
  /**
   * Get DCF calculator instance (for direct use in Agent)
   */
  getDCFCalculator() {
    return this.dcfCalculator;
  }
}
function createToolRegistry() {
  const cacheManager = new import_utils.CacheManager();
  const rateLimiter = new import_utils.RateLimiter();
  return new ToolRegistry(cacheManager, rateLimiter);
}
function getToolsRegistry() {
  const registry = createToolRegistry();
  return registry.getTools();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ToolRegistry,
  createToolRegistry,
  getToolsRegistry
});
