import {Tool} from '@modelcontextprotocol/sdk/types.js';
import {CompanyDataFetcher, DataType} from './data-fetching/company-data-fetcher';
import {DCFCalculator} from './dcf/dcf-calculator';
import {CacheManager, RateLimiter} from '@stock-analyzer/shared/utils';
import {generatePDFTool, handleGeneratePDF} from './pdf/generate-pdf-tool';
import { ToolName } from '@stock-analyzer/shared/types';
import { SentimentDataFetcher } from './sentiment/sentiment-data-fetcher';
import { NewsDataFetcher } from './news/news-data-fetcher';

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
  private sentimentDataFetcher: SentimentDataFetcher;
  private newsDataFetcher: NewsDataFetcher;

  constructor(
    private cacheManager: CacheManager,
    private rateLimiter: RateLimiter
  ) {
    this.companyDataFetcher = new CompanyDataFetcher(cacheManager, rateLimiter);
    this.dcfCalculator = new DCFCalculator();
    this.sentimentDataFetcher = new SentimentDataFetcher(cacheManager, rateLimiter);
    this.newsDataFetcher = new NewsDataFetcher(cacheManager, rateLimiter);
  }

  /**
   * Get all available tools as MCP Tool definitions
   */
  getTools(): Tool[] {
    return [
      {
        name: ToolName.FETCH_COMPANY_DATA,
        description: `Fetch essential financial data for a company in a single comprehensive call.

CRITICAL: Call this tool ONLY ONCE per analysis. It returns everything you need:
- Company profile (sector, industry, market cap, description)
- Current stock quote (price, volume, day change)
- Last 4 quarters of income statements (revenue, earnings, margins)
- Last 4 quarters of balance sheets (assets, liabilities, equity)
- Last 4 quarters of cash flow statements (operating, investing, financing)

This single call provides sufficient data for complete analysis. The data is optimized
to stay within Claude's 25K token tool response limit while providing comprehensive
financial coverage (1 year of quarterly data).

DO NOT make multiple calls - all essential data is included in one response.`,
        inputSchema: {
          type: 'object',
          properties: {
            ticker: {
              type: 'string',
              description: 'Stock ticker symbol (e.g., AAPL, GOOGL). This is the ONLY parameter needed.',
            },
          },
          required: ['ticker'],
        },
      },
      {
        name: ToolName.CALCULATE_DCF,
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
        name: ToolName.TEST_API_CONNECTION,
        description: 'Test if the FMP API key is valid and working. Returns connection status.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: ToolName.FETCH_SENTIMENT_DATA,
        description: `Fetch sentiment analysis data for a stock ticker.

Returns:
- News sentiment from multiple sources
- Social media sentiment (Twitter, Reddit, StockTwits)
- Analyst ratings and grades
- Sentiment trend changes

Use this to gauge market mood and investor sentiment for investment decisions.`,
        inputSchema: {
          type: 'object',
          properties: {
            ticker: {
              type: 'string',
              description: 'Stock ticker symbol (e.g., AAPL, TSLA)',
            },
            includeNews: {
              type: 'boolean',
              description: 'Include news sentiment analysis',
              default: true,
            },
            includeSocial: {
              type: 'boolean',
              description: 'Include social media sentiment',
              default: true,
            },
            includeGrades: {
              type: 'boolean',
              description: 'Include analyst grades',
              default: true,
            },
          },
          required: ['ticker'],
        },
      },
      {
        name: ToolName.FETCH_NEWS,
        description: `Fetch recent news articles for a stock ticker.

Returns up to 20 recent news articles with:
- Headline and summary
- Publication date and source
- News URL
- Related tickers

Use this to understand recent developments affecting the stock.`,
        inputSchema: {
          type: 'object',
          properties: {
            ticker: {
              type: 'string',
              description: 'Stock ticker symbol',
            },
            limit: {
              type: 'number',
              description: 'Number of articles to fetch (max 20)',
              default: 10,
            },
          },
          required: ['ticker'],
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
      case ToolName.FETCH_COMPANY_DATA:
        return await this.handleFetchCompanyData(args);
      case ToolName.CALCULATE_DCF:
        return await this.handleCalculateDCF(args);
      case ToolName.TEST_API_CONNECTION:
        return await this.handleTestApiConnection();
      case ToolName.GENERATE_PDF:
        return await handleGeneratePDF(args);
      case ToolName.FETCH_SENTIMENT_DATA:
        return await this.handleFetchSentimentData(args);
      case ToolName.FETCH_NEWS:
        return await this.handleFetchNews(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async handleFetchCompanyData(args: any) {
    const { ticker } = args;

    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    // Fixed configuration optimized for Claude's 25K token tool response limit
    // Fetch: profile, quote, and 4 quarters of essential financials
    // This keeps response under 25K tokens even for large-cap companies
    const dataTypes: DataType[] = [
      'profile',
      'quote',
      'income_statement',
      'balance_sheet',
      'cash_flow',
    ];
    const options = {
      period: 'quarter' as const,
      limit: 4  // 4 quarters = 1 year, optimized for token limits
    };

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

  private async handleFetchSentimentData(args: any) {
    const { ticker, includeNews, includeSocial, includeGrades } = args;

    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    const sentimentData = await this.sentimentDataFetcher.fetchSentimentData(ticker, {
      includeNews: includeNews !== false,
      includeSocial: includeSocial !== false,
      includeGrades: includeGrades !== false,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(sentimentData, null, 2),
        },
      ],
    };
  }

  private async handleFetchNews(args: any) {
    const { ticker, limit = 10 } = args;

    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    const newsData = await this.newsDataFetcher.fetchNews(ticker, {
      limit: Math.min(limit, 20), // Cap at 20
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(newsData, null, 2),
        },
      ],
    };
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
