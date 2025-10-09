/**
 * Hook type definitions
 * Hooks are middleware-like functions that intercept SDK operations
 */

// SDK message types (simplified for hook purposes)
export interface SDKMessage {
  type: string;
  message?: any;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ToolUseMessage {
  name: string;
  input: any;
  id?: string;
}

export interface ToolResultMessage {
  tool_use_id: string;
  content: any;
  is_error?: boolean;
}

/**
 * Hook function types
 */
export type OnMessageHook = (message: SDKMessage) => void;
export type OnToolUseHook = (toolUse: ToolUseMessage) => ToolUseMessage | void;
export type OnToolResultHook = (result: ToolResultMessage) => ToolResultMessage | void;

/**
 * Hook context for session-aware operations
 */
export interface HookContext {
  sessionId: string;
  chatId: string;
  ticker: string;
  phase: 'full-analysis' | 'executive-summary' | 'conversation';
}

/**
 * Budget configuration for cost control
 */
export interface BudgetConfig {
  limit: number;
  used: number;
  toolCosts: Record<string, number>;
}
