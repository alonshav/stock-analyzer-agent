/**
 * Sentiment Analysis Types
 * Data structures for news sentiment, social media sentiment, and analyst ratings
 */

export interface NewsSentiment {
  symbol: string;
  title: string;
  publishedDate: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  url: string;
  text: string;
  site: string;
}

export interface SocialSentiment {
  symbol: string;
  date: string;
  stocktwitsPosts: number;
  twitterPosts: number;
  stocktwitsComments: number;
  twitterComments: number;
  stocktwitsLikes: number;
  twitterLikes: number;
  stocktwitsImpressions: number;
  twitterImpressions: number;
  stocktwitsSentiment: number; // 0 to 1
  twitterSentiment: number; // 0 to 1
  // Note: Reddit data not included in FMP API response
  // Legacy fields for backward compatibility (optional)
  redditPosts?: number;
  redditComments?: number;
  redditLikes?: number;
  redditImpressions?: number;
  sentiment?: number; // Average sentiment (calculated)
  sentimentClassification?: 'bearish' | 'bullish' | 'neutral'; // Calculated
}

export interface SentimentChange {
  symbol: string;
  date: string;
  sentiment: number;
  sentimentChange: number;
  percentChange: number;
}

export interface StockGrade {
  symbol: string;
  date: string;
  gradingCompany: string;
  previousGrade: string;
  newGrade: string;
}

export interface StockNews {
  symbol: string;
  title: string;
  publishedDate: string;
  url: string;
  text: string;
  site: string;
  image?: string;
}
