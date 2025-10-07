import axios, { AxiosInstance } from 'axios';
import {
  CompanyProfile,
  Quote,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  KeyMetrics,
  FinancialRatios,
} from '@stock-analyzer/shared/types';

export class FMPAdapter {
  private apiKey: string;
  private baseURL: string;
  private client: AxiosInstance;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('FMP API key is required');
    }

    this.apiKey = apiKey;
    this.baseURL = 'https://financialmodelingprep.com/api/v3';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      config.params = {
        ...config.params,
        apikey: this.apiKey,
      };
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          if (status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
          } else if (status === 401) {
            throw new Error('Invalid API key. Please check your FMP_API_KEY environment variable.');
          } else if (status === 403) {
            throw new Error('Access forbidden. Your FMP API key may be invalid, expired, or you may have exceeded your plan limits. Please verify your API key at https://site.financialmodelingprep.com/developer/docs');
          } else if (status === 404) {
            throw new Error('Data not found for the requested ticker');
          }
          throw new Error(data?.message || `API error: ${status}`);
        }
        throw error;
      }
    );
  }

  async getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
    try {
      const response = await this.client.get(`/profile/${ticker.toUpperCase()}`);
      const data = response.data[0];

      if (!data) return null;

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
        ipoDate: data.ipoDate,
      };
    } catch (error) {
      console.error('Error fetching company profile:', error);
      throw error;
    }
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    try {
      const response = await this.client.get(`/quote/${ticker.toUpperCase()}`);
      const data = response.data[0];

      if (!data) return null;

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
        timestamp: data.timestamp,
      };
    } catch (error) {
      console.error('Error fetching quote:', error);
      throw error;
    }
  }

  async getIncomeStatements(ticker: string, limit: number = 5, period: 'annual' | 'quarter' = 'annual'): Promise<IncomeStatement[]> {
    try {
      const response = await this.client.get(`/income-statement/${ticker.toUpperCase()}`, {
        params: { limit, period },
      });

      return response.data || [];
    } catch (error) {
      console.error('Error fetching income statements:', error);
      throw error;
    }
  }

  async getBalanceSheets(ticker: string, limit: number = 5, period: 'annual' | 'quarter' = 'annual'): Promise<BalanceSheet[]> {
    try {
      const response = await this.client.get(`/balance-sheet-statement/${ticker.toUpperCase()}`, {
        params: { limit, period },
      });

      return response.data || [];
    } catch (error) {
      console.error('Error fetching balance sheets:', error);
      throw error;
    }
  }

  async getCashFlowStatements(ticker: string, limit: number = 5, period: 'annual' | 'quarter' = 'annual'): Promise<CashFlowStatement[]> {
    try {
      const response = await this.client.get(`/cash-flow-statement/${ticker.toUpperCase()}`, {
        params: { limit, period },
      });

      return response.data || [];
    } catch (error) {
      console.error('Error fetching cash flow statements:', error);
      throw error;
    }
  }

  async getKeyMetrics(ticker: string, limit: number = 5, period: 'annual' | 'quarter' = 'annual'): Promise<KeyMetrics[]> {
    try {
      const response = await this.client.get(`/key-metrics/${ticker.toUpperCase()}`, {
        params: { limit, period },
      });

      return response.data || [];
    } catch (error) {
      console.error('Error fetching key metrics:', error);
      throw error;
    }
  }

  async getFinancialRatios(ticker: string, limit: number = 5, period: 'annual' | 'quarter' = 'annual'): Promise<FinancialRatios[]> {
    try {
      const response = await this.client.get(`/ratios/${ticker.toUpperCase()}`, {
        params: { limit, period },
      });

      return response.data || [];
    } catch (error) {
      console.error('Error fetching financial ratios:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/stock-list');
      return Array.isArray(response.data) && response.data.length > 0;
    } catch (error) {
      console.error('FMP connection test failed:', error);
      return false;
    }
  }
}
