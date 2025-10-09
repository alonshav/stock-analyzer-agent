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
  PDF = 'pdf',
  COMPLETE = 'complete',
  ERROR = 'error',
}

// ============================================================================
// Analysis Status
// ============================================================================

export enum AnalysisStatus {
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  ERROR = 'error',
}

// ============================================================================
// Framework and Model Constants
// ============================================================================

export const FRAMEWORK_VERSION = 'v2.3';
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
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
  return `analysis.${type}.${sessionId}`;
};

// Helper to check if a tool name matches (handles both MCP-prefixed and plain names)
export const isToolName = (actual: string, expected: ToolName): boolean => {
  return actual === expected || actual === `${MCP_TOOL_PREFIX}${expected}`;
};
