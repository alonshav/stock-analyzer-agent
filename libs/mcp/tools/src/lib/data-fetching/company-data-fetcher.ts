import { FMPAdapter } from '@stock-analyzer/mcp/integrations';
import { CacheManager, RateLimiter } from '@stock-analyzer/shared/utils';
import { CompanyData } from '@stock-analyzer/shared/types';

export type DataType =
  | 'profile'
  | 'financials'
  | 'income_statement'
  | 'balance_sheet'
  | 'cash_flow'
  | 'ratios'
  | 'key_metrics'
  | 'quote';

interface FetchOptions {
  useCache?: boolean;
  forceRefresh?: boolean;
  limit?: number;
  period?: 'annual' | 'quarter';
}

export class CompanyDataFetcher {
  private fmpAdapter: FMPAdapter;
  private cacheManager: CacheManager;
  private rateLimiter: RateLimiter;

  constructor(cacheManager: CacheManager, rateLimiter: RateLimiter) {
    const apiKey = process.env['FMP_API_KEY'];
    if (!apiKey) {
      throw new Error('FMP_API_KEY environment variable is required');
    }

    this.fmpAdapter = new FMPAdapter(apiKey);
    this.cacheManager = cacheManager;
    this.rateLimiter = rateLimiter;
  }

  async fetchData(
    ticker: string,
    dataTypes: DataType[] = ['profile', 'quote'],
    options: FetchOptions = {}
  ): Promise<CompanyData> {
    const { useCache = true, forceRefresh = false, limit = 5, period = 'annual' } = options;

    ticker = ticker.toUpperCase();

    const result: CompanyData = {
      timestamp: new Date(),
    };

    const errors: string[] = [];

    for (const dataType of dataTypes) {
      try {
        const data = await this.fetchDataType(ticker, dataType, {
          useCache: useCache && !forceRefresh,
          limit,
          period,
        });

        switch (dataType) {
          case 'profile':
            result.profile = data;
            break;
          case 'quote':
            result.quote = data;
            break;
          case 'income_statement':
            if (!result.financials) result.financials = {};
            result.financials.incomeStatements = data;
            break;
          case 'balance_sheet':
            if (!result.financials) result.financials = {};
            result.financials.balanceSheets = data;
            break;
          case 'cash_flow':
            if (!result.financials) result.financials = {};
            result.financials.cashFlowStatements = data;
            break;
          case 'financials':
            result.financials = await this.fetchAllFinancials(ticker, { useCache, limit, period });
            break;
          case 'ratios':
            result.ratios = data;
            break;
          case 'key_metrics':
            result.keyMetrics = data;
            break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch ${dataType}: ${errorMessage}`);
        console.error(`Error fetching ${dataType} for ${ticker}:`, error);
      }
    }

    if (errors.length > 0 && Object.keys(result).length === 1) {
      throw new Error(`Failed to fetch data: ${errors.join('; ')}`);
    }

    return result;
  }

  private async fetchDataType(
    ticker: string,
    dataType: DataType,
    options: { useCache?: boolean; limit?: number; period?: 'annual' | 'quarter' }
  ): Promise<any> {
    const { useCache = true, limit = 5, period = 'annual' } = options;

    const cacheKey = this.cacheManager.generateKey(ticker, dataType, { limit, period });

    if (useCache) {
      const cachedData = await this.cacheManager.get(cacheKey);
      if (cachedData !== null) {
        return cachedData;
      }
    }

    const canProceed = await this.rateLimiter.waitForTokens('fmp_api', 1, 5000);
    if (!canProceed) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    let data: any;

    switch (dataType) {
      case 'profile':
        data = await this.fmpAdapter.getCompanyProfile(ticker);
        break;
      case 'quote':
        data = await this.fmpAdapter.getQuote(ticker);
        break;
      case 'income_statement':
        data = await this.fmpAdapter.getIncomeStatements(ticker, limit, period);
        break;
      case 'balance_sheet':
        data = await this.fmpAdapter.getBalanceSheets(ticker, limit, period);
        break;
      case 'cash_flow':
        data = await this.fmpAdapter.getCashFlowStatements(ticker, limit, period);
        break;
      case 'ratios':
        data = await this.fmpAdapter.getFinancialRatios(ticker, limit, period);
        break;
      case 'key_metrics':
        data = await this.fmpAdapter.getKeyMetrics(ticker, limit, period);
        break;
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }

    if (data !== null && data !== undefined) {
      await this.cacheManager.set(cacheKey, data, dataType);
    }

    return data;
  }

  private async fetchAllFinancials(
    ticker: string,
    options: { useCache?: boolean; limit?: number; period?: 'annual' | 'quarter' }
  ) {
    const [incomeStatements, balanceSheets, cashFlowStatements] = await Promise.all([
      this.fetchDataType(ticker, 'income_statement', options),
      this.fetchDataType(ticker, 'balance_sheet', options),
      this.fetchDataType(ticker, 'cash_flow', options),
    ]);

    return {
      incomeStatements,
      balanceSheets,
      cashFlowStatements,
    };
  }

  async validateTicker(ticker: string): Promise<boolean> {
    try {
      const profile = await this.fetchDataType(ticker, 'profile', { useCache: true });
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

  async clearCache(ticker?: string) {
    if (ticker) {
      const pattern = `^${ticker.toUpperCase()}:`;
      return await this.cacheManager.deleteByPattern(pattern);
    } else {
      await this.cacheManager.flush();
      return -1;
    }
  }
}
