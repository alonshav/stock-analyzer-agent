/**
 * Enhanced AgentService with:
 * - Session Management
 * - All 7 SDK Message Types
 * - Two Modes: Workflow + Conversation
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  query,
  createSdkMcpServer,
  tool,
  type SDKMessage,
  type SDKSystemMessage,
  type SDKAssistantMessage,
  type SDKUserMessage,
  type SDKResultMessage,
  type SDKPartialAssistantMessage,
  type SDKCompactBoundaryMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { STOCK_VALUATION_FRAMEWORK } from './prompts/framework-v2.3';
import { createToolRegistry } from '@stock-analyzer/mcp/tools';
import { z } from 'zod';
import {
  createEventName,
  StreamEventType,
  FRAMEWORK_VERSION,
  DEFAULT_MODEL,
  DEFAULT_MAX_TURNS,
  DEFAULT_MAX_THINKING_TOKENS,
} from '@stock-analyzer/shared/types';
import {
  SessionManagerService,
  MessageRole,
} from '@stock-analyzer/agent/session';

export interface AnalysisOptions {
  generatePDF?: boolean;
  focusAreas?: string[];
  peerTickers?: string[];
  investmentHorizon?: string;
}

export interface AnalysisResult {
  ticker: string;
  timestamp: string;
  fullAnalysis?: string;
  executiveSummary: string;
  metadata: {
    analysisDate: string;
    framework: string;
    model: string;
    duration: number;
  };
}

export interface ExecuteQueryParams {
  chatId: string;
  sessionId: string;
  ticker: string;
  prompt: string;
  phase: 'full-analysis' | 'executive-summary' | 'conversation';
  streamToClient: boolean;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly toolRegistry;
  private readonly mcpServer;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private sessionManager: SessionManagerService
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    // Set API key for Claude Agent SDK
    process.env['ANTHROPIC_API_KEY'] = apiKey;

    this.toolRegistry = createToolRegistry();

    // Convert MCP tools to SDK tools
    const mcpTools = this.toolRegistry.getTools();
    const sdkTools = mcpTools.map((mcpTool) => {
      const zodSchema = this.convertToZodSchema(mcpTool.inputSchema);

      return tool(
        mcpTool.name,
        mcpTool.description || '',
        zodSchema,
        async (args) => {
          try {
            this.logger.debug(`Executing tool: ${mcpTool.name}`);
            const result = await this.toolRegistry.executeTool(
              mcpTool.name,
              args
            );
            this.logger.debug(
              `Tool ${mcpTool.name} returned result type: ${typeof result}`
            );
            return result;
          } catch (error) {
            this.logger.error(`Error in tool ${mcpTool.name}:`, error);
            return {
              content: [
                {
                  type: 'text',
                  text: `Error executing ${mcpTool.name}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );
    });

    this.mcpServer = createSdkMcpServer({
      name: 'stock-analyzer-tools',
      version: '1.0.0',
      tools: sdkTools,
    });

    this.logger.log(
      `Initialized Claude Agent SDK with ${sdkTools.length} tools`
    );
  }

  /**
   * WORKFLOW MODE: Full Stock Analysis
   * Creates session, runs analysis with streaming
   */
  async analyzeStock(
    chatId: string,
    ticker: string,
    userPrompt: string,
    _options?: AnalysisOptions,
    sessionId?: string
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    this.logger.log(`Starting stock analysis for ${ticker} in chat ${chatId}`);
    // Step 1: Create session
    const session = this.sessionManager.createSession(chatId, ticker);
    const sessionIdToUse = sessionId || session.sessionId;

    this.logger.log(`[${sessionIdToUse}] Starting analysis for ${ticker}`);

    try {
      // Step 2: Execute analysis with streaming
      const executiveSummary = await this.executeQuery({
        chatId,
        sessionId: sessionIdToUse,
        ticker,
        prompt: userPrompt,
        phase: 'executive-summary',
        streamToClient: !!sessionId,
      });

      // Step 3: Complete session
      this.sessionManager.completeSession(
        chatId,
        executiveSummary,
        executiveSummary
      );

      // Step 4: Emit completion
      const duration = Date.now() - startTime;
      const result: AnalysisResult = {
        ticker,
        timestamp: new Date().toISOString(),
        executiveSummary,
        metadata: {
          analysisDate: new Date().toISOString(),
          framework: FRAMEWORK_VERSION,
          model: this.config.get('ANTHROPIC_MODEL') || DEFAULT_MODEL,
          duration,
        },
      };

      if (sessionId) {
        this.eventEmitter.emit(
          createEventName(StreamEventType.COMPLETE, sessionId),
          {
            ticker,
            timestamp: result.timestamp,
            metadata: result.metadata,
          }
        );
      }

      this.logger.log(`Analysis complete for ${ticker} (${duration}ms)`);
      return result;
    } catch (error) {
      this.logger.error(`[${sessionIdToUse}] Analysis failed:`, error);
      this.sessionManager.stopSession(chatId);
      throw error;
    }
  }

  /**
   * CONVERSATION MODE: Follow-up Questions
   * Uses session context, streams response
   */
  async handleConversation(
    chatId: string,
    message: string,
    streamId?: string
  ): Promise<string> {
    // Try to get ACTIVE session first, then fall back to COMPLETED
    this.logger.log(
      `Handling conversation for chat ${chatId} with message: ${message.substring(
        0,
        50
      )}...`
    );
    const session =
      this.sessionManager.getActiveSession(chatId) ||
      this.sessionManager.getCompletedSession(chatId);

    if (!session) {
      throw new Error('No active or completed session for conversation');
    }

    const effectiveSessionId = streamId || session.sessionId;

    this.logger.log(
      `[${effectiveSessionId}] Conversation: ${message.substring(0, 50)}...`
    );

    // Step 1: Build context from session
    const contextPrompt = this.sessionManager.buildContextPrompt(
      chatId,
      message
    );

    // Step 2: Execute with streaming (use streamId for event emission if provided)
    const result = await this.executeQuery({
      chatId,
      sessionId: effectiveSessionId,
      ticker: session.ticker,
      prompt: contextPrompt,
      phase: 'conversation',
      streamToClient: !!streamId, // Only stream if streamId provided
    });

    // Step 3: Save to session
    this.sessionManager.addMessage(chatId, MessageRole.USER, message);
    this.sessionManager.addMessage(chatId, MessageRole.ASSISTANT, result);

    // Step 4: Emit completion event if streamId provided
    if (streamId) {
      this.eventEmitter.emit(
        createEventName(StreamEventType.COMPLETE, streamId),
        {
          ticker: session.ticker,
          metadata: {
            analysisDate: new Date().toISOString(),
            framework: FRAMEWORK_VERSION,
            model: this.config.get('ANTHROPIC_MODEL') || DEFAULT_MODEL,
            duration: 0, // Conversation is quick
          },
        }
      );
    }

    return result;
  }

  /**
   * Core Query Executor
   * Handles all 7 SDK message types with debug logging
   */
  private async executeQuery(params: ExecuteQueryParams): Promise<string> {
    const { chatId, sessionId, ticker, prompt, phase, streamToClient } = params;

    let fullContent = '';
    let totalTokens = 0;

    // Create SDK query with session-aware hooks
    const stream = query({
      prompt,
      options: {
        systemPrompt: STOCK_VALUATION_FRAMEWORK,
        model: this.config.get('ANTHROPIC_MODEL') || DEFAULT_MODEL,
        maxThinkingTokens: DEFAULT_MAX_THINKING_TOKENS,
        maxTurns: parseInt(
          this.config.get('ANTHROPIC_MAX_TURNS') || String(DEFAULT_MAX_TURNS)
        ),
        permissionMode: 'bypassPermissions',
        mcpServers: {
          'stock-analyzer': this.mcpServer,
        },
        includePartialMessages: false,

        // Basic debug hooks for monitoring
        hooks: {
          SessionStart: [
            {
              hooks: [
                async () => {
                  this.logger.debug(
                    `[${sessionId}] Session started for chat ${chatId}`
                  );
                  return { continue: true };
                },
              ],
            },
          ],
          PreToolUse: [
            {
              hooks: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                async (input: any, toolUseID?: string) => {
                  this.logger.debug(
                    `[${sessionId}] PreToolUse - tool: ${input.tool_name}, toolId: ${toolUseID}`
                  );
                  this.logger.debug(
                    `[${sessionId}] Tool input: ${JSON.stringify(
                      input.tool_input
                    )}`
                  );
                  return { continue: true };
                },
              ],
            },
          ],
          PostToolUse: [
            {
              hooks: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                async (input: any, toolUseID?: string) => {
                  this.logger.debug(
                    `[${sessionId}] PostToolUse - toolId: ${toolUseID}`
                  );
                  this.logger.debug(
                    `[${sessionId}] Tool response type: ${typeof input.tool_response}`
                  );
                  return { continue: true };
                },
              ],
            },
          ],
        },
      },
    });

    // ============================================================================
    // STREAM MESSAGE PROCESSING (All 7 SDK Message Types)
    // ============================================================================
    for await (const message of stream) {
      // Log message receipt (debug mode shows full JSON)
      this.logger.log(`[${sessionId}] ━━━ Message Type: ${message.type} ━━━`);
      this.logger.debug(
        `[${sessionId}] Full message: ${JSON.stringify(message, null, 2)}`
      );

      try {
        switch (message.type) {
          // ====================================================================
          // 1. SYSTEM MESSAGE - Initialization and compaction events
          // ====================================================================
          case 'system': {
            if ('subtype' in message && message.subtype === 'init') {
              const initMessage = message as SDKSystemMessage;
              this.handleSystemInitMessage(
                initMessage,
                sessionId,
                ticker,
                streamToClient
              );
            } else if (
              'subtype' in message &&
              message.subtype === 'compact_boundary'
            ) {
              const compactMessage = message as SDKCompactBoundaryMessage;
              this.handleCompactBoundaryMessage(
                compactMessage,
                sessionId,
                ticker,
                streamToClient
              );
            }
            break;
          }

          // ====================================================================
          // 2. PARTIAL ASSISTANT MESSAGE - Streaming text chunks
          // ====================================================================
          case 'stream_event': {
            const streamEvent = message as SDKPartialAssistantMessage;
            this.handlePartialAssistantMessage(
              streamEvent,
              sessionId,
              ticker,
              streamToClient
            );
            break;
          }

          // ====================================================================
          // 3. ASSISTANT MESSAGE - Complete response with content blocks
          // ====================================================================
          case 'assistant': {
            const assistantMessage = message as SDKAssistantMessage;
            const textContent = this.handleAssistantMessage(
              assistantMessage,
              sessionId,
              ticker,
              phase,
              streamToClient
            );
            fullContent += textContent;

            // Track token usage
            if (assistantMessage.message.usage) {
              const inputTokens = assistantMessage.message.usage.input_tokens;
              const outputTokens = assistantMessage.message.usage.output_tokens;
              totalTokens += inputTokens + outputTokens;
              this.logger.debug(
                `[${sessionId}]    📊 Tokens: ${inputTokens} in + ${outputTokens} out = ${totalTokens} total`
              );
            }
            break;
          }

          // ====================================================================
          // 4. USER MESSAGE - Tool results from system
          // ====================================================================
          case 'user': {
            const userMessage = message as SDKUserMessage;
            this.handleUserMessage(
              userMessage,
              sessionId,
              ticker,
              streamToClient
            );
            break;
          }

          // ====================================================================
          // 5. RESULT MESSAGE - Final conversation result with metadata
          // ====================================================================
          case 'result': {
            const resultMsg = message as SDKResultMessage;
            this.handleResultMessage(
              resultMsg,
              sessionId,
              ticker,
              totalTokens,
              streamToClient
            );
            break;
          }

          // ====================================================================
          // 6. UNKNOWN MESSAGE TYPE - Log warning for unexpected types
          // ====================================================================
          default: {
            const unknownMsg = message as SDKMessage;
            this.handleUnknownMessage(unknownMsg, sessionId);
            break;
          }
        }
      } catch (messageError) {
        this.logger.error(
          `[${sessionId}] Error processing message:`,
          messageError
        );
        // Continue processing other messages
      }
    }

    return fullContent;
  }

  /**
   * Handle system initialization message
   */
  private handleSystemInitMessage(
    initMessage: SDKSystemMessage,
    sessionId: string,
    ticker: string,
    streamToClient: boolean
  ): void {
    this.logger.log(
      `[${sessionId}] 🔧 System initialized - Model: ${initMessage.model}, Mode: ${initMessage.permissionMode}`
    );
    if (streamToClient) {
      this.eventEmitter.emit(
        createEventName(StreamEventType.SYSTEM, sessionId),
        {
          ticker,
          model: initMessage.model,
          permissionMode: initMessage.permissionMode,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  /**
   * Handle compact boundary message
   */
  private handleCompactBoundaryMessage(
    compactMessage: SDKCompactBoundaryMessage,
    sessionId: string,
    ticker: string,
    streamToClient: boolean
  ): void {
    const trigger = compactMessage.compact_metadata.trigger;
    const preTokens = compactMessage.compact_metadata.pre_tokens;
    this.logger.log(
      `[${sessionId}] 📦 Conversation compacted - Trigger: ${trigger}, Pre-tokens: ${preTokens}`
    );
    if (streamToClient) {
      this.eventEmitter.emit(
        createEventName(StreamEventType.COMPACTION, sessionId),
        {
          ticker,
          trigger,
          messagesBefore: preTokens,
          messagesAfter: 0,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  /**
   * Handle partial assistant message (streaming text chunks)
   * Processes RawContentBlockDeltaEvent from Anthropic streaming API
   */
  private handlePartialAssistantMessage(
    streamEvent: SDKPartialAssistantMessage,
    sessionId: string,
    ticker: string,
    streamToClient: boolean
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = streamEvent.event as any;

    // Handle different delta types according to RawContentBlockDeltaEvent spec
    let partialText = '';
    let deltaType = '';

    if (event?.type === 'content_block_delta') {
      const delta = event.delta;

      if (delta?.type === 'text_delta') {
        // TextDelta: { type: 'text_delta', text: string }
        partialText = delta.text || '';
        deltaType = 'text';
      } else if (delta?.type === 'thinking_delta') {
        // ThinkingDelta: { type: 'thinking_delta', thinking: string }
        partialText = delta.thinking || '';
        deltaType = 'thinking';
      } else if (delta?.type === 'input_json_delta') {
        // InputJsonDelta: { type: 'input_json_delta', partial_json: string }
        partialText = delta.partial_json || '';
        deltaType = 'tool_input';
      }
    } else {
      // Fallback for other event types (legacy support)
      partialText = event?.delta?.text || event?.text || '';
      deltaType = 'unknown';
    }

    if (partialText) {
      const preview = partialText.substring(0, 50).replace(/\n/g, ' ');
      this.logger.log(
        `[${sessionId}] 📝 Partial [${deltaType}] (${partialText.length} chars): "${preview}..."`
      );
    }

    if (streamToClient && partialText) {
      this.eventEmitter.emit(
        createEventName(StreamEventType.PARTIAL, sessionId),
        {
          ticker,
          partialContent: partialText,
          deltaType,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  /**
   * Handle complete assistant message with content blocks
   * Returns the text content accumulated from this message
   */
  private handleAssistantMessage(
    assistantMessage: SDKAssistantMessage,
    sessionId: string,
    ticker: string,
    phase: string,
    streamToClient: boolean
  ): string {
    const apiMessage = assistantMessage.message;
    let textContent = '';

    // Process all content blocks
    for (const block of apiMessage.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'thinking') {
        if (streamToClient) {
          this.eventEmitter.emit(
            createEventName(StreamEventType.THINKING, sessionId),
            {
              ticker,
              message: block.thinking,
              timestamp: new Date().toISOString(),
            }
          );
        }
      } else if (block.type === 'tool_use') {
        if (streamToClient) {
          this.eventEmitter.emit(
            createEventName(StreamEventType.TOOL, sessionId),
            {
              ticker,
              toolName: block.name,
              toolId: block.id,
              toolInput: block.input,
              timestamp: new Date().toISOString(),
            }
          );
        }
      }
    }

    // Emit chunk event (only for conversation mode or if streamToClient is true)
    if (streamToClient) {
      this.eventEmitter.emit(
        createEventName(StreamEventType.CHUNK, sessionId),
        {
          ticker,
          content: textContent,
          phase,
          timestamp: new Date().toISOString(),
        }
      );
    }

    return textContent;
  }

  /**
   * Handle user message (tool results)
   */
  private handleUserMessage(
    userMessage: SDKUserMessage,
    sessionId: string,
    ticker: string,
    streamToClient: boolean
  ): void {
    const apiMessage = userMessage.message;
    const toolResults: Array<{
      toolId: string;
      toolName: string;
      success: boolean;
    }> = [];

    for (const block of apiMessage.content) {
      if (block.type === 'tool_result') {
        const isError = block.is_error || false;

        toolResults.push({
          toolId: block.tool_use_id,
          toolName: 'tool_result',
          success: !isError,
        });

        if (streamToClient) {
          this.eventEmitter.emit(
            createEventName(StreamEventType.TOOL_RESULT, sessionId),
            {
              ticker,
              toolId: block.tool_use_id,
              timestamp: new Date().toISOString(),
            }
          );
        }
      }
    }

    // Log summary
    if (toolResults.length > 0) {
      this.logger.log(`[${sessionId}] 📥 Tool Results (${toolResults.length})`);
      toolResults.forEach((r) => {
        const status = r.success ? '✅' : '❌';
        this.logger.log(
          `[${sessionId}]    ${status} ${r.toolName} (${r.toolId})`
        );
      });
    }
  }

  /**
   * Handle result message (final conversation result)
   */
  private handleResultMessage(
    resultMsg: SDKResultMessage,
    sessionId: string,
    ticker: string,
    totalTokens: number,
    streamToClient: boolean
  ): void {
    const isSuccess = resultMsg.subtype === 'success';
    const executionTime = resultMsg.duration_ms || 0;
    const cost = resultMsg.total_cost_usd || 0;

    this.logger.log(
      `[${sessionId}] 🏁 Result - ${isSuccess ? 'Success' : 'Error'}`
    );
    this.logger.log(`[${sessionId}]    ⏱️  Duration: ${executionTime}ms`);
    if (cost > 0) {
      this.logger.log(`[${sessionId}]    💰 Cost: $${cost.toFixed(4)}`);
    }
    this.logger.log(`[${sessionId}]    📊 Total Tokens: ${totalTokens}`);

    if (streamToClient) {
      this.eventEmitter.emit(
        createEventName(StreamEventType.RESULT, sessionId),
        {
          ticker,
          success: isSuccess,
          executionTime,
          cost,
          totalTokens,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  /**
   * Handle unknown message type
   */
  private handleUnknownMessage(
    unknownMsg: SDKMessage,
    sessionId: string
  ): void {
    this.logger.warn(
      `[${sessionId}] ⚠️  Unknown message type: ${unknownMsg.type}`
    );
    this.logger.debug(
      `[${sessionId}] Full unknown message: ${JSON.stringify(
        unknownMsg,
        null,
        2
      )}`
    );
  }

  // Helper to convert JSON Schema to Zod schema (preserved from original)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertToZodSchema(jsonSchema: any): any {
    const properties = jsonSchema.properties || {};
    const required = jsonSchema.required || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zodShape: any = {};

    for (const [key, value] of Object.entries(properties)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prop = value as any;

      if (prop.type === 'array' && prop.items) {
        const itemSchema = prop.items;
        if (itemSchema.enum && Array.isArray(itemSchema.enum)) {
          const enumValues = itemSchema.enum as [string, ...string[]];
          zodShape[key] = required.includes(key)
            ? z.array(z.enum(enumValues))
            : z.array(z.enum(enumValues)).optional();
        } else if (itemSchema.type === 'number') {
          zodShape[key] = required.includes(key)
            ? z.array(z.number())
            : z.array(z.number()).optional();
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          zodShape[key] = required.includes(key)
            ? z.array(z.any())
            : z.array(z.any()).optional();
        }
      } else if (
        prop.type === 'string' &&
        prop.enum &&
        Array.isArray(prop.enum)
      ) {
        const enumValues = prop.enum as [string, ...string[]];
        zodShape[key] = required.includes(key)
          ? z.enum(enumValues)
          : z.enum(enumValues).optional();
      } else if (prop.type === 'string') {
        zodShape[key] = required.includes(key)
          ? z.string()
          : z.string().optional();
      } else if (prop.type === 'number') {
        let numberSchema = z.number();
        if (typeof prop.minimum === 'number') {
          numberSchema = numberSchema.min(prop.minimum);
        }
        if (typeof prop.maximum === 'number') {
          numberSchema = numberSchema.max(prop.maximum);
        }
        zodShape[key] = required.includes(key)
          ? numberSchema
          : numberSchema.optional();
      } else if (prop.type === 'object') {
        zodShape[key] = required.includes(key)
          ? z.object({}).passthrough()
          : z.object({}).passthrough().optional();
      }
    }

    return zodShape;
  }
}
