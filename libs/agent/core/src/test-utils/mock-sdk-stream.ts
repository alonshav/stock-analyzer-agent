/**
 * Mock utilities for testing Anthropic Agent SDK streams
 * Provides helpers to create all 7 SDK message types
 */

export interface MockAssistantMessage {
  type: 'assistant';
  message: {
    id: string;
    role: 'assistant';
    model: string;
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'thinking'; thinking: string }
      | { type: 'tool_use'; id: string; name: string; input: any }
    >;
    stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface MockUserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | {
          type: 'tool_result';
          tool_use_id: string;
          content: Array<{ type: 'text'; text: string }>;
          is_error?: boolean;
        }
    >;
  };
}

export interface MockUserMessageReplay {
  type: 'user_message_replay';
  uuid: string;
  message: {
    role: 'user';
    content: Array<{ type: 'text'; text: string }>;
  };
}

export interface MockResultMessage {
  type: 'result';
  conversationUuid: string;
  executionTimeMs: number;
  costUsd?: number;
  totalTokens?: number;
  error?: {
    type: string;
    message: string;
  };
  permissionDenials?: Array<{
    toolName: string;
    reason: string;
  }>;
}

export interface MockSystemMessage {
  type: 'system';
  apiKeySource: 'env' | 'options' | 'config';
  model: string;
  permissionMode: 'requirePermissions' | 'bypassPermissions';
  tools?: Array<{ name: string; description: string }>;
}

export interface MockPartialAssistantMessage {
  type: 'partial_assistant';
  partialText: string;
  partialThinking?: string;
}

export interface MockCompactBoundaryMessage {
  type: 'compact_boundary';
  trigger: 'manual' | 'automatic';
  originalMessageCount: number;
  compactedMessageCount: number;
}

export type MockSDKMessage =
  | MockAssistantMessage
  | MockUserMessage
  | MockUserMessageReplay
  | MockResultMessage
  | MockSystemMessage
  | MockPartialAssistantMessage
  | MockCompactBoundaryMessage;

export class MockSDKStream {
  /**
   * Create assistant message with text content
   */
  static createAssistantMessage(
    text: string,
    options?: {
      stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
      usage?: { input_tokens: number; output_tokens: number };
    }
  ): MockAssistantMessage {
    return {
      type: 'assistant',
      message: {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text }],
        stop_reason: options?.stopReason || 'end_turn',
        usage: options?.usage || { input_tokens: 1000, output_tokens: 500 },
      },
    };
  }

  /**
   * Create assistant message with thinking content
   */
  static createThinkingMessage(thinking: string): MockAssistantMessage {
    return {
      type: 'assistant',
      message: {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'thinking', thinking }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1000, output_tokens: 500 },
      },
    };
  }

  /**
   * Create assistant message with tool use
   */
  static createToolUseMessage(
    name: string,
    input: any,
    toolId?: string
  ): MockAssistantMessage {
    return {
      type: 'assistant',
      message: {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        content: [
          {
            type: 'tool_use',
            id: toolId || `toolu_${Date.now()}`,
            name,
            input,
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 1000, output_tokens: 100 },
      },
    };
  }

  /**
   * Create user message with tool result
   */
  static createToolResultMessage(
    toolUseId: string,
    result: string,
    isError = false
  ): MockUserMessage {
    return {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: [{ type: 'text', text: result }],
            is_error: isError,
          },
        ],
      },
    };
  }

  /**
   * Create user message replay
   */
  static createUserMessageReplay(
    text: string,
    uuid?: string
  ): MockUserMessageReplay {
    return {
      type: 'user_message_replay',
      uuid: uuid || `uuid_${Date.now()}`,
      message: {
        role: 'user',
        content: [{ type: 'text', text }],
      },
    };
  }

  /**
   * Create result message
   */
  static createResultMessage(
    options?: {
      executionTimeMs?: number;
      costUsd?: number;
      totalTokens?: number;
      error?: { type: string; message: string };
    }
  ): MockResultMessage {
    return {
      type: 'result',
      conversationUuid: `conv_${Date.now()}`,
      executionTimeMs: options?.executionTimeMs || 15000,
      costUsd: options?.costUsd || 0.05,
      totalTokens: options?.totalTokens || 2500,
      error: options?.error,
      permissionDenials: [],
    };
  }

  /**
   * Create system message
   */
  static createSystemMessage(
    options?: {
      apiKeySource?: 'env' | 'options' | 'config';
      model?: string;
      permissionMode?: 'requirePermissions' | 'bypassPermissions';
      tools?: Array<{ name: string; description: string }>;
    }
  ): MockSystemMessage {
    return {
      type: 'system',
      apiKeySource: options?.apiKeySource || 'env',
      model: options?.model || 'claude-sonnet-4-20250514',
      permissionMode: options?.permissionMode || 'bypassPermissions',
      tools: options?.tools || [
        { name: 'fetch_company_data', description: 'Fetch company data' },
      ],
    };
  }

  /**
   * Create partial assistant message
   */
  static createPartialMessage(
    partialText: string,
    partialThinking?: string
  ): MockPartialAssistantMessage {
    return {
      type: 'partial_assistant',
      partialText,
      partialThinking,
    };
  }

  /**
   * Create compact boundary message
   */
  static createCompactBoundaryMessage(
    trigger: 'manual' | 'automatic',
    originalCount: number,
    compactedCount: number
  ): MockCompactBoundaryMessage {
    return {
      type: 'compact_boundary',
      trigger,
      originalMessageCount: originalCount,
      compactedMessageCount: compactedCount,
    };
  }

  /**
   * Create error message (as result type with error)
   */
  static createErrorMessage(errorMessage: string): MockResultMessage {
    return {
      type: 'result',
      conversationUuid: `conv_${Date.now()}`,
      executionTimeMs: 1000,
      error: {
        type: 'api_error',
        message: errorMessage,
      },
    };
  }

  /**
   * Create full stream for different scenarios
   */
  static async *createFullStream(
    scenario: 'success' | 'error' | 'with-tools'
  ): AsyncGenerator<MockSDKMessage> {
    // System initialization
    yield MockSDKStream.createSystemMessage();

    if (scenario === 'error') {
      yield MockSDKStream.createErrorMessage('Rate limit exceeded');
      return;
    }

    if (scenario === 'with-tools') {
      // Thinking
      yield MockSDKStream.createThinkingMessage('Analyzing AAPL data...');

      // Tool use
      const toolId = 'toolu_123';
      yield MockSDKStream.createToolUseMessage(
        'mcp__stock-analyzer__fetch_company_data',
        { ticker: 'AAPL', dataTypes: ['profile', 'quote'] },
        toolId
      );

      // Tool result
      yield MockSDKStream.createToolResultMessage(
        toolId,
        JSON.stringify({ success: true, data: { ticker: 'AAPL' } })
      );
    }

    // Assistant response
    yield MockSDKStream.createAssistantMessage(
      'Apple Inc. is a technology company...',
      { stopReason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 1000 } }
    );

    // Final result
    yield MockSDKStream.createResultMessage({
      executionTimeMs: 15000,
      costUsd: 0.05,
      totalTokens: 3000,
    });
  }

  /**
   * Create stream from array of messages
   */
  static async *createStream(
    messages: MockSDKMessage[]
  ): AsyncGenerator<MockSDKMessage> {
    for (const message of messages) {
      yield message;
    }
  }
}
