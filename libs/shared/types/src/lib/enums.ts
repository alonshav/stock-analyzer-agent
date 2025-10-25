/**
 * Shared enums used across the entire application
 * Tools, Agent, SSE, and Bot all reference these constants
 */

// ============================================================================
// Tool Names
// ============================================================================

export enum ToolName {
  FETCH_COMPANY_DATA = 'fetch_company_data',
  CALCULATE_DCF = 'calculate_dcf',
  GENERATE_PDF = 'generate_pdf',
  TEST_API_CONNECTION = 'test_api_connection',
  FETCH_SENTIMENT_DATA = 'fetch_sentiment_data',
  FETCH_NEWS = 'fetch_news',
}

/**
 * MCP-prefixed tool names (as they appear in Agent SDK)
 */
export const MCP_TOOL_PREFIX = 'mcp__stock-analyzer__';

export const MCPToolName = {
  FETCH_COMPANY_DATA: `${MCP_TOOL_PREFIX}${ToolName.FETCH_COMPANY_DATA}`,
  CALCULATE_DCF: `${MCP_TOOL_PREFIX}${ToolName.CALCULATE_DCF}`,
  GENERATE_PDF: `${MCP_TOOL_PREFIX}${ToolName.GENERATE_PDF}`,
  TEST_API_CONNECTION: `${MCP_TOOL_PREFIX}${ToolName.TEST_API_CONNECTION}`,
  FETCH_SENTIMENT_DATA: `${MCP_TOOL_PREFIX}${ToolName.FETCH_SENTIMENT_DATA}`,
  FETCH_NEWS: `${MCP_TOOL_PREFIX}${ToolName.FETCH_NEWS}`,
} as const;

// ============================================================================
// Financial Data Types
// ============================================================================

export enum FinancialDataType {
  PROFILE = 'profile',
  QUOTE = 'quote',
  INCOME_STATEMENT = 'income-statement',
  BALANCE_SHEET = 'balance-sheet',
  CASH_FLOW = 'cash-flow',
  KEY_METRICS = 'key-metrics',
  RATIOS = 'ratios',
}

export const FinancialDataTypeLabel: Record<FinancialDataType, string> = {
  [FinancialDataType.PROFILE]: 'Company profile',
  [FinancialDataType.QUOTE]: 'Current quote',
  [FinancialDataType.INCOME_STATEMENT]: 'Income statements',
  [FinancialDataType.BALANCE_SHEET]: 'Balance sheets',
  [FinancialDataType.CASH_FLOW]: 'Cash flow statements',
  [FinancialDataType.KEY_METRICS]: 'Key metrics',
  [FinancialDataType.RATIOS]: 'Financial ratios',
};

// ============================================================================
// Report Types
// ============================================================================

export enum ReportType {
  FULL = 'full',
  SUMMARY = 'summary',
}

export const ReportTypeLabel: Record<ReportType, string> = {
  [ReportType.FULL]: 'Full Analysis',
  [ReportType.SUMMARY]: 'Executive Summary',
};

// ============================================================================
// Period Types
// ============================================================================

export enum PeriodType {
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
}

// ============================================================================
// SSE Stream Event Types
// ============================================================================

export enum StreamEventType {
  CONNECTED = 'connected',
  CHUNK = 'chunk',
  THINKING = 'thinking',
  TOOL = 'tool',
  TOOL_RESULT = 'tool_result',
  PDF = 'pdf',
  RESULT = 'result',
  SYSTEM = 'system',
  COMPACTION = 'compaction',
  PARTIAL = 'partial',
  COMPLETE = 'complete',
  ERROR = 'error',
}

// ============================================================================
// Workflow Types
// ============================================================================

export enum WorkflowType {
  FULL_ANALYSIS = 'full_analysis',
  SENTIMENT = 'sentiment',
  DCF_VALUATION = 'dcf_valuation',
  PEER_COMPARISON = 'peer_comparison',
  EARNINGS = 'earnings',
  NEWS = 'news',
  // Note: Conversation is not a workflow - it's the default mode
}

export interface WorkflowConfig {
  type: WorkflowType;
  systemPrompt: string;
  model: string;
  maxTurns: number;
  maxThinkingTokens: number;
  enabledTools: string[];
}

export interface WorkflowParams {
  ticker: string;
  userPrompt?: string;
  additionalContext?: Record<string, unknown>;
}

// ============================================================================
// Anthropic Model IDs
// ============================================================================

/**
 * Anthropic Claude model identifiers
 * Official model IDs from Anthropic API documentation (as of 2025)
 *
 * Note: Use specific dated versions (e.g., claude-sonnet-4-5-20250929) for
 * production to ensure consistent behavior. Aliases without dates point to
 * the most recent snapshot.
 */
export enum AnthropicModel {
  // Current Models (2025)

  /** Claude Sonnet 4.5 - Most intelligent model, best for coding and complex agents */
  SONNET_4_5 = 'claude-sonnet-4-5-20250929',

  /** Claude Haiku 4.5 - Fast, cost-effective for high-volume tasks */
  HAIKU_4_5 = 'claude-haiku-4-5-20251001',

  /** Claude Opus 4.1 - Most capable model for highly complex tasks */
  OPUS_4_1 = 'claude-opus-4-1-20250805',

  // Legacy Models (Still Available)

  /** Claude Sonnet 4 - Previous generation, May 2025 snapshot */
  SONNET_4 = 'claude-sonnet-4-20250514',

  /** Claude Opus 4 - Previous generation, May 2025 snapshot */
  OPUS_4 = 'claude-opus-4-20250514',

  /** Claude 3.7 Sonnet - February 2025 snapshot */
  SONNET_3_7 = 'claude-3-7-sonnet-20250219',

  /** Claude 3.5 Haiku - October 2024 snapshot */
  HAIKU_3_5 = 'claude-3-5-haiku-20241022',

  // Model Aliases (auto-update to latest snapshot - avoid in production)

  /** Alias for latest Sonnet 4.5 (currently points to 20250929) */
  SONNET_4_5_ALIAS = 'claude-sonnet-4-5',

  /** Alias for latest Haiku 4.5 (currently points to 20251001) */
  HAIKU_4_5_ALIAS = 'claude-haiku-4-5',

  /** Alias for latest Opus 4.1 (currently points to 20250805) */
  OPUS_4_1_ALIAS = 'claude-opus-4-1',

  /** Alias for latest Sonnet 4 (currently points to 20250514) */
  SONNET_4_ALIAS = 'claude-sonnet-4',
}

// ============================================================================
// Framework and Model Constants
// ============================================================================

export const FRAMEWORK_VERSION = 'v2.3';
export const DEFAULT_MODEL = AnthropicModel.HAIKU_4_5;
export const DEFAULT_MAX_TURNS = 20;
export const DEFAULT_MAX_THINKING_TOKENS = 10000;

// ============================================================================
// Time Constants (in milliseconds)
// ============================================================================

export const TimeConstants = {
  STREAM_UPDATE_INTERVAL: 500, // Update Telegram message every 500ms
  STREAM_CHUNK_THRESHOLD: 5, // Or every 5 chunks
  INTERVENTION_CHECK_INTERVAL: 15000, // Check for interventions every 15s
  INTERVENTION_MIN_GAP: 15000, // Minimum 15s between interventions
  INTERVENTION_30S: 30000, // First intervention at 30s
  INTERVENTION_60S: 60000, // Second intervention at 60s
  INTERVENTION_90S: 90000, // Third intervention at 90s
  STREAM_TIMEOUT: 300000, // 5 minute timeout
} as const;

// ============================================================================
// Telegram Message Limits
// ============================================================================

export const TelegramLimits = {
  MAX_MESSAGE_LENGTH: 4096,
  SAFE_MESSAGE_LENGTH: 4000,
  TRUNCATED_MESSAGE_LENGTH: 3800,
} as const;

// ============================================================================
// Event Names (for EventEmitter)
// ============================================================================

export const createEventName = (type: StreamEventType, sessionId: string): string => {
  return `stream.${sessionId}`;
};

// Helper to check if a tool name matches (handles both MCP-prefixed and plain names)
export const isToolName = (actual: string, expected: ToolName): boolean => {
  return actual === expected || actual === `${MCP_TOOL_PREFIX}${expected}`;
};
