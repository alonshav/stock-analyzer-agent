/**
 * HooksService
 * Provides middleware-like hooks for SDK operations
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionManagerService } from 'session-manager';
import {
  OnMessageHook,
  OnToolUseHook,
  OnToolResultHook,
  BudgetConfig,
  SDKMessage,
  ToolUseMessage,
  ToolResultMessage,
} from './interfaces/hook-types';

@Injectable()
export class HooksService {
  private readonly logger = new Logger(HooksService.name);
  private budgets = new Map<string, BudgetConfig>();
  private toolResultCache = new Map<string, string>();

  constructor(
    private eventEmitter: EventEmitter2,
    private sessionManager: SessionManagerService
  ) {}

  // ========================================================================
  // Hook Factories
  // ========================================================================

  /**
   * Create onMessage hook for tracking messages and tokens
   */
  createOnMessageHook(sessionId: string, chatId: string): OnMessageHook {
    return (message: SDKMessage) => {
      // Log all message types
      this.logger.debug(`[${sessionId}] Message: ${message.type}`);

      // Track token usage
      if (message.type === 'assistant' && message.usage) {
        const session = this.sessionManager.getActiveSession(chatId);
        if (session) {
          const usage = message.usage;
          this.sessionManager.addMetric(
            chatId,
            'tokens',
            usage.input_tokens + usage.output_tokens
          );
        }
      }

      // Emit progress event
      this.eventEmitter.emit(`stream.progress.${sessionId}`, {
        sessionId,
        messageType: message.type,
        timestamp: new Date().toISOString(),
      });
    };
  }

  /**
   * Create onToolUse hook for validation, budgets, and context injection
   */
  createOnToolUseHook(sessionId: string, chatId: string): OnToolUseHook {
    return (toolUse: ToolUseMessage) => {
      const session = this.sessionManager.getActiveSession(chatId);

      // Validation
      this.validateToolInput(toolUse.name, toolUse.input);

      // Budget control
      const budget = this.budgets.get(sessionId);
      if (budget) {
        const cost = budget.toolCosts[toolUse.name] || 0.01;
        if (budget.used + cost > budget.limit) {
          throw new Error(
            `Budget exceeded: $${budget.used.toFixed(2)}/$${budget.limit.toFixed(2)}`
          );
        }
        budget.used += cost;
      }

      // Track tool call metric
      this.sessionManager.addMetric(chatId, 'toolCalls', 1);

      // Inject session context
      return {
        ...toolUse,
        input: {
          ...toolUse.input,
          sessionId,
          tickerContext: session?.ticker,
        },
      };
    };
  }

  /**
   * Create onToolResult hook for error enhancement and caching
   */
  createOnToolResultHook(sessionId: string, chatId: string): OnToolResultHook {
    return (result: ToolResultMessage) => {
      const session = this.sessionManager.getActiveSession(chatId);

      // Track errors
      if (result.is_error) {
        this.sessionManager.addMetric(chatId, 'errors', 1);

        // Enhance errors with context
        return {
          ...result,
          content: this.enhanceErrorWithContext(result.content, session),
        };
      }

      // Filter sensitive data
      let content = this.filterSensitiveData(result.content);

      // Cache result
      this.toolResultCache.set(result.tool_use_id, content);

      return {
        ...result,
        content,
      };
    };
  }

  // ========================================================================
  // Budget Management
  // ========================================================================

  setBudget(sessionId: string, budget: BudgetConfig): void {
    this.budgets.set(sessionId, budget);
  }

  getBudget(sessionId: string): BudgetConfig | undefined {
    return this.budgets.get(sessionId);
  }

  // ========================================================================
  // Tool Result Caching
  // ========================================================================

  getCachedResult(toolUseId: string): string | undefined {
    return this.toolResultCache.get(toolUseId);
  }

  // ========================================================================
  // Hook Composition
  // ========================================================================

  composeToolUseHooks(hooks: OnToolUseHook[]): OnToolUseHook {
    return (toolUse: ToolUseMessage) => {
      return hooks.reduce((current, hook) => {
        const result = hook(current);
        return result || current;
      }, toolUse);
    };
  }

  // ========================================================================
  // Private Utility Methods
  // ========================================================================

  private validateToolInput(toolName: string, input: any): void {
    // Validate fetch_company_data
    if (toolName === 'fetch_company_data' || toolName === 'mcp__stock-analyzer__fetch_company_data') {
      if (!input.ticker) {
        throw new Error('Missing required parameter: ticker');
      }
    }

    // Validate calculate_dcf
    if (toolName === 'calculate_dcf' || toolName === 'mcp__stock-analyzer__calculate_dcf') {
      if (!input.ticker) {
        throw new Error('Missing required parameter: ticker');
      }
    }

    // Add more validations as needed
  }

  private enhanceErrorWithContext(error: string, session: any): string {
    if (!session) return error;

    return (
      `Error occurred while analyzing ${session.ticker}:\n\n` +
      error +
      `\n\nSession info:\n` +
      `• Started: ${session.startedAt.toLocaleString()}\n` +
      `• Conversation turns: ${session.conversationHistory.length}`
    );
  }

  private filterSensitiveData(content: string): string {
    try {
      const data = JSON.parse(content);
      const { apiKey, apiSecret, password, token, ...safe } = data;
      return JSON.stringify(safe);
    } catch {
      // Not JSON, return as-is
      return content;
    }
  }
}
