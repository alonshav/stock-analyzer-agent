import { FMPAdapter } from '@stock-analyzer/mcp/integrations';
import { CacheManager, RateLimiter } from '@stock-analyzer/shared/utils';
import {
  NewsSentiment,
  SocialSentiment,
  SentimentChange,
  StockGrade,
} from '@stock-analyzer/shared/types';

export interface SentimentData {
  ticker: string;
  timestamp: Date;
  newsSentiment?: NewsSentiment[];
  socialSentiment?: SocialSentiment | null;
  sentimentChanges?: SentimentChange[];
  stockGrades?: StockGrade[];
  errors?: string[];
}

export interface SentimentFetchOptions {
  includeNews?: boolean;
  includeSocial?: boolean;
  includeGrades?: boolean;
  useCache?: boolean;
  forceRefresh?: boolean;
}

export class SentimentDataFetcher {
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

  async fetchSentimentData(
    ticker: string,
    options: SentimentFetchOptions = {}
  ): Promise<SentimentData> {
    const {
      includeNews = true,
      includeSocial = true,
      includeGrades = true,
      useCache = true,
      forceRefresh = false,
    } = options;

    ticker = ticker.toUpperCase();

    const result: SentimentData = {
      ticker,
      timestamp: new Date(),
      errors: [],
    };

    const adapter = this.ensureAdapter();

    // Fetch news sentiment
    if (includeNews) {
      try {
        const cacheKey = `${ticker}:news_sentiment`;
        let newsSentiment: NewsSentiment[] | null = null;

        if (useCache && !forceRefresh) {
          newsSentiment = this.cacheManager.get<NewsSentiment[]>(cacheKey);
        }

        if (!newsSentiment) {
          await this.rateLimiter.checkLimit(ticker);
          newsSentiment = await adapter.getStockNewsSentiment(ticker);
          if (useCache && newsSentiment) {
            this.cacheManager.set(cacheKey, newsSentiment, 'news_sentiment');
          }
        }

        result.newsSentiment = newsSentiment || [];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Failed to fetch news sentiment: ${errorMessage}`);
        console.error(`Error fetching news sentiment for ${ticker}:`, error);
      }
    }

    // Fetch social sentiment
    if (includeSocial) {
      try {
        const cacheKey = `${ticker}:social_sentiment`;
        let socialSentiment: SocialSentiment | null = null;

        if (useCache && !forceRefresh) {
          socialSentiment = this.cacheManager.get<SocialSentiment>(cacheKey);
        }

        if (!socialSentiment) {
          await this.rateLimiter.checkLimit(ticker);
          socialSentiment = await adapter.getSocialSentiment(ticker);
          if (useCache && socialSentiment) {
            this.cacheManager.set(cacheKey, socialSentiment, 'social_sentiment');
          }
        }

        result.socialSentiment = socialSentiment;

        // Also fetch sentiment changes
        const changesKey = `${ticker}:sentiment_changes`;
        let sentimentChanges: SentimentChange[] | null = null;

        if (useCache && !forceRefresh) {
          sentimentChanges = this.cacheManager.get<SentimentChange[]>(changesKey);
        }

        if (!sentimentChanges) {
          await this.rateLimiter.checkLimit(ticker);
          sentimentChanges = await adapter.getSocialSentimentChanges(ticker);
          if (useCache && sentimentChanges) {
            this.cacheManager.set(changesKey, sentimentChanges, 'sentiment_changes');
          }
        }

        result.sentimentChanges = sentimentChanges || [];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Failed to fetch social sentiment: ${errorMessage}`);
        console.error(`Error fetching social sentiment for ${ticker}:`, error);
      }
    }

    // Fetch stock grades (analyst ratings)
    if (includeGrades) {
      try {
        const cacheKey = `${ticker}:stock_grades`;
        let stockGrades: StockGrade[] | null = null;

        if (useCache && !forceRefresh) {
          stockGrades = this.cacheManager.get<StockGrade[]>(cacheKey);
        }

        if (!stockGrades) {
          await this.rateLimiter.checkLimit(ticker);
          stockGrades = await adapter.getStockGrades(ticker, 10);
          if (useCache && stockGrades) {
            this.cacheManager.set(cacheKey, stockGrades, 'stock_grades');
          }
        }

        result.stockGrades = stockGrades || [];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Failed to fetch stock grades: ${errorMessage}`);
        console.error(`Error fetching stock grades for ${ticker}:`, error);
      }
    }

    return result;
  }
}
