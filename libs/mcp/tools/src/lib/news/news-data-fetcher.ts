import { FMPAdapter } from '@stock-analyzer/mcp/integrations';
import { CacheManager, RateLimiter } from '@stock-analyzer/shared/utils';
import { StockNews } from '@stock-analyzer/shared/types';

export interface NewsData {
  ticker: string;
  timestamp: Date;
  news: StockNews[];
  errors?: string[];
}

export interface NewsFetchOptions {
  limit?: number;
  useCache?: boolean;
  forceRefresh?: boolean;
}

export class NewsDataFetcher {
  private fmpAdapter: FMPAdapter | null = null;
  private cacheManager: CacheManager;
  private rateLimiter: RateLimiter;

  constructor(cacheManager: CacheManager, rateLimiter: RateLimiter) {
    this.cacheManager = cacheManager;
    this.rateLimiter = rateLimiter;
  }

  private ensureAdapter(): FMPAdapter {
    if (!this.fmpAdapter) {
      const apiKey = process.env['FMP_API_KEY'];
      if (!apiKey) {
        throw new Error('FMP_API_KEY environment variable is required');
      }
      this.fmpAdapter = new FMPAdapter(apiKey);
    }
    return this.fmpAdapter;
  }

  async fetchNews(
    ticker: string,
    options: NewsFetchOptions = {}
  ): Promise<NewsData> {
    const {
      limit = 20,
      useCache = true,
      forceRefresh = false,
    } = options;

    ticker = ticker.toUpperCase();

    const result: NewsData = {
      ticker,
      timestamp: new Date(),
      news: [],
      errors: [],
    };

    const adapter = this.ensureAdapter();

    try {
      const cacheKey = `${ticker}:stock_news:${limit}`;
      let news: StockNews[] | null = null;

      if (useCache && !forceRefresh) {
        news = this.cacheManager.get<StockNews[]>(cacheKey);
      }

      if (!news) {
        await this.rateLimiter.checkLimit(ticker);
        news = await adapter.getStockNews(ticker, limit);
        if (useCache && news) {
          this.cacheManager.set(cacheKey, news, 'stock_news');
        }
      }

      result.news = news || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(`Failed to fetch news: ${errorMessage}`);
      console.error(`Error fetching news for ${ticker}:`, error);
    }

    return result;
  }
}
