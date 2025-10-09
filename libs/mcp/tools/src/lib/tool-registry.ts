import {Tool} from '@modelcontextprotocol/sdk/types.js';
import {CompanyDataFetcher} from './data-fetching/company-data-fetcher';
import {DCFCalculator} from './dcf/dcf-calculator';
import {CacheManager, RateLimiter} from '@stock-analyzer/shared/utils';
import {generatePDFTool, handleGeneratePDF} from './pdf/generate-pdf-tool';

/**
 * Tool Registry for MCP Tools
 *
 * These tools can be used by:
 * 1. MCP Server (stdio protocol) - uses Tool definitions
 * 2. Agent Service (direct import) - uses Tool definitions with Anthropic SDK
 */

export class ToolRegistry {
  private companyDataFetcher: CompanyDataFetcher;
  private dcfCalculator: DCFCalculator;

  constructor(
    private cacheManager: CacheManager,
    private rateLimiter: RateLimiter
  ) {
    this.companyDataFetcher = new CompanyDataFetcher(cacheManager, rateLimiter);
    this.dcfCalculator = new DCFCalculator();
  }

  /**
   * Get all available tools as MCP Tool definitions
   */
  getTools(): Tool[] {
    return [
      {
        name: 'fetch_company_data',
        description: 'Fetch comprehensive financial data for a company from Financial Modeling Prep API',
        inputSchema: {
          type: 'object',
          properties: {
            ticker: {
              type: 'string',
              description: 'Stock ticker symbol (e.g., AAPL, GOOGL)',
            },
            dataTypes: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'profile',
                  'financials',
                  'income_statement',
                  'balance_sheet',
                  'cash_flow',
                  'ratios',
                  'key_metrics',
                  'quote',
                ],
              },
              description: 'Types of data to fetch',
              default: ['profile', 'quote'],
            },
            period: {
              type: 'string',
              enum: ['annual', 'quarter'],
              description: 'Period type: annual for yearly data, quarter for quarterly data',
              default: 'quarter',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 20,
              description: 'Number of periods to fetch (1-20)',
              default: 5,
            },
          },
          required: ['ticker'],
        },
      },
      {
        name: 'calculate_dcf',
        description: 'Calculate DCF (Discounted Cash Flow) valuation using provided projections and assumptions. Returns enterprise value, equity value, and fair value per share.',
        inputSchema: {
          type: 'object',
          properties: {
            projectedFreeCashFlows: {
              type: 'array',
              items: { type: 'number' },
              description: 'Array of projected free cash flows for each year (in USD)',
            },
            terminalGrowthRate: {
              type: 'number',
              description: 'Terminal growth rate (e.g., 0.025 for 2.5%)',
            },
            discountRate: {
              type: 'number',
              description: 'WACC/discount rate (e.g., 0.10 for 10%)',
            },
            netDebt: {
              type: 'number',
              description: 'Net debt (total debt minus cash) in USD',
            },
            sharesOutstanding: {
              type: 'number',
              description: 'Diluted shares outstanding',
            },
            currentRevenue: {
              type: 'number',
              description: 'Optional: Current year revenue for context',
            },
            projectedRevenues: {
              type: 'array',
              items: { type: 'number' },
              description: 'Optional: Array of projected revenues corresponding to FCF projections',
            },
            assumptions: {
              type: 'object',
              description: 'Optional: Additional assumptions and context for reference',
              properties: {
                projectionYears: { type: 'number' },
                baseYear: { type: 'string' }
              }
            }
          },
          required: ['projectedFreeCashFlows', 'terminalGrowthRate', 'discountRate', 'netDebt', 'sharesOutstanding'],
        },
      },
      {
        name: 'test_api_connection',
        description: 'Test if the FMP API key is valid and working. Returns connection status.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      generatePDFTool,
    ];
  }

  /**
   * Execute a tool by name with given arguments
   */
  async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'fetch_company_data':
        return await this.handleFetchCompanyData(args);
      case 'calculate_dcf':
        return await this.handleCalculateDCF(args);
      case 'test_api_connection':
        return await this.handleTestApiConnection();
      case 'generate_pdf':
        return await handleGeneratePDF(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async handleFetchCompanyData(args: any) {
    const { ticker, dataTypes, period = 'quarter', limit = 5 } = args;

    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    const options = { period, limit };
    const data = await this.companyDataFetcher.fetchData(ticker, dataTypes, options);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async handleCalculateDCF(args: any) {
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

    // Validate required parameters
    if (!projectedFreeCashFlows || !Array.isArray(projectedFreeCashFlows)) {
      throw new Error('projectedFreeCashFlows array is required for DCF analysis');
    }
    if (typeof terminalGrowthRate !== 'number') {
      throw new Error('terminalGrowthRate is required for DCF analysis');
    }
    if (typeof discountRate !== 'number') {
      throw new Error('discountRate is required for DCF analysis');
    }
    if (typeof netDebt !== 'number') {
      throw new Error('netDebt is required for DCF analysis');
    }
    if (typeof sharesOutstanding !== 'number') {
      throw new Error('sharesOutstanding is required for DCF analysis');
    }

    try {
      // Perform DCF calculation
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

      // Format results for display
      const formattedResults = this.dcfCalculator.formatResults(dcfResults);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              dcfResults,
              formattedAnalysis: formattedResults
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in DCF calculation';
      throw new Error(`DCF calculation failed: ${errorMessage}`);
    }
  }

  private async handleTestApiConnection() {
    try {
      const apiKey = process.env['FMP_API_KEY'];

      if (!apiKey) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: FMP_API_KEY environment variable is not set. Please add it to your environment configuration.',
            },
          ],
        };
      }

      // Test with a simple quote request for AAPL
      await this.companyDataFetcher.fetchData('AAPL', ['quote']);

      return {
        content: [
          {
            type: 'text',
            text: `✅ API connection successful!\nAPI Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}\nTest data retrieved for AAPL.`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `❌ API connection failed!\n${errorMessage}\n\nPlease check:\n1. Your FMP_API_KEY is correct\n2. You have an active FMP subscription\n3. Your API limits haven't been exceeded`,
          },
        ],
      };
    }
  }

  /**
   * Get company data fetcher instance (for direct use in Agent)
   */
  getCompanyDataFetcher(): CompanyDataFetcher {
    return this.companyDataFetcher;
  }

  /**
   * Get DCF calculator instance (for direct use in Agent)
   */
  getDCFCalculator(): DCFCalculator {
    return this.dcfCalculator;
  }
}

/**
 * Factory function to create and export tool registry
 * Used by both MCP Server and Agent Service
 */
export function createToolRegistry(): ToolRegistry {
  const cacheManager = new CacheManager();
  const rateLimiter = new RateLimiter();
  return new ToolRegistry(cacheManager, rateLimiter);
}

/**
 * Convenience function to get all tools (for Agent SDK)
 * Agent can import this directly: import { getToolsRegistry } from '@stock-analyzer/mcp/tools';
 */
export function getToolsRegistry(): Tool[] {
  const registry = createToolRegistry();
  return registry.getTools();
}
