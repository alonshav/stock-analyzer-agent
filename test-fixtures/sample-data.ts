/**
 * Sample test data fixtures
 */

import { MockSDKStream } from '../libs/agent/core/src/test-utils/mock-sdk-stream';
import { MockSessionManager } from '../libs/agent/core/src/test-utils/mock-session';
import { AnthropicModel } from '@stock-analyzer/shared/types';

/**
 * Sample FMP API company data response
 */
export const SAMPLE_COMPANY_DATA = {
  ticker: 'AAPL',
  profile: {
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    industry: 'Consumer Electronics',
    sector: 'Technology',
    marketCap: 3000000000000,
    description: 'Apple Inc. designs, manufactures, and markets smartphones...',
  },
  quote: {
    symbol: 'AAPL',
    price: 185.50,
    volume: 50000000,
    dayChange: 2.30,
    dayChangePercent: 1.25,
  },
  incomeStatement: [
    {
      date: '2024-09-30',
      period: 'Q4',
      revenue: 94930000000,
      costOfRevenue: 52300000000,
      grossProfit: 42630000000,
      netIncome: 22956000000,
    },
    {
      date: '2024-06-30',
      period: 'Q3',
      revenue: 85780000000,
      costOfRevenue: 47200000000,
      grossProfit: 38580000000,
      netIncome: 21448000000,
    },
  ],
  balanceSheet: [
    {
      date: '2024-09-30',
      period: 'Q4',
      totalAssets: 364980000000,
      totalLiabilities: 290440000000,
      totalEquity: 74540000000,
    },
  ],
  cashFlowStatement: [
    {
      date: '2024-09-30',
      period: 'Q4',
      operatingCashFlow: 31200000000,
      investingCashFlow: -5100000000,
      financingCashFlow: -23400000000,
    },
  ],
  keyMetrics: [
    {
      date: '2024-09-30',
      period: 'Q4',
      peRatio: 28.5,
      priceToSalesRatio: 7.8,
      roe: 0.45,
      roa: 0.22,
    },
  ],
};

/**
 * Sample SDK analysis stream (successful scenario)
 */
export const SAMPLE_ANALYSIS_STREAM = [
  MockSDKStream.createSystemMessage({
    model: AnthropicModel.SONNET_4,
    permissionMode: 'bypassPermissions',
    tools: [
      { name: 'fetch_company_data', description: 'Fetch company financial data' },
      { name: 'calculate_dcf', description: 'Calculate DCF valuation' },
    ],
  }),
  MockSDKStream.createThinkingMessage('Analyzing AAPL financial data...'),
  MockSDKStream.createToolUseMessage(
    'mcp__stock-analyzer__fetch_company_data',
    {
      ticker: 'AAPL',
      dataTypes: ['profile', 'quote', 'income', 'balance', 'cashflow'],
      period: 'quarter',
      limit: 8,
    },
    'toolu_fetch_001'
  ),
  MockSDKStream.createToolResultMessage(
    'toolu_fetch_001',
    JSON.stringify({ success: true, data: SAMPLE_COMPANY_DATA })
  ),
  MockSDKStream.createAssistantMessage(
    'Apple Inc. demonstrates strong financial fundamentals...',
    {
      stopReason: 'end_turn',
      usage: { input_tokens: 2500, output_tokens: 1200 },
    }
  ),
  MockSDKStream.createResultMessage({
    executionTimeMs: 18000,
    costUsd: 0.06,
    totalTokens: 3700,
  }),
];

/**
 * Sample session data
 */
export const SAMPLE_SESSION = MockSessionManager.createSessionWithHistory(
  'AAPL',
  'chat123',
  [
    { role: 'user', content: 'What is the P/E ratio?' },
    { role: 'assistant', content: 'The P/E ratio for AAPL is 28.5...' },
    { role: 'user', content: 'How does that compare to MSFT?' },
  ]
);

/**
 * Sample completed sessions for testing recent sessions
 */
export const SAMPLE_RECENT_SESSIONS = MockSessionManager.createMultipleSessions(
  'chat123',
  ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'],
  1000
);

/**
 * Sample error stream
 */
export const SAMPLE_ERROR_STREAM = [
  MockSDKStream.createSystemMessage(),
  MockSDKStream.createErrorMessage('API rate limit exceeded'),
];

/**
 * Sample tool-heavy stream
 */
export const SAMPLE_TOOL_HEAVY_STREAM = [
  MockSDKStream.createSystemMessage(),
  MockSDKStream.createThinkingMessage('Analyzing data...'),
  MockSDKStream.createToolUseMessage(
    'mcp__stock-analyzer__fetch_company_data',
    { ticker: 'AAPL', dataTypes: ['profile'] },
    'toolu_001'
  ),
  MockSDKStream.createToolResultMessage('toolu_001', JSON.stringify({ success: true })),
  MockSDKStream.createToolUseMessage(
    'mcp__stock-analyzer__calculate_dcf',
    { ticker: 'AAPL', projectionYears: 5 },
    'toolu_002'
  ),
  MockSDKStream.createToolResultMessage(
    'toolu_002',
    JSON.stringify({ intrinsicValue: 195.50 })
  ),
  MockSDKStream.createAssistantMessage('Based on DCF analysis...'),
  MockSDKStream.createResultMessage(),
];
