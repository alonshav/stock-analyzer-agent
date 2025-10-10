/**
 * Enhanced AgentService with:
 * - Session Management
 * - Hooks Integration
 * - All 7 SDK Message Types
 * - Two Modes: Workflow + Conversation
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { STOCK_VALUATION_FRAMEWORK } from './prompts/framework-v2.3';
import { createToolRegistry } from '@stock-analyzer/mcp/tools';
import { z } from 'zod';
import {
  isToolName,
  ToolName,
  createEventName,
  StreamEventType,
  FRAMEWORK_VERSION,
  DEFAULT_MODEL,
  DEFAULT_MAX_TURNS,
  DEFAULT_MAX_THINKING_TOKENS
} from '@stock-analyzer/shared/types';
import { SessionManagerService, MessageRole } from '@stock-analyzer/agent/session';
import { HooksService } from '@stock-analyzer/agent/hooks';

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

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly toolRegistry;
  private readonly mcpServer;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private sessionManager: SessionManagerService,
    private hooksService: HooksService
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
            const result = await this.toolRegistry.executeTool(mcpTool.name, args);
            this.logger.debug(`Tool ${mcpTool.name} returned result type: ${typeof result}`);
            return result;
          } catch (error) {
            this.logger.error(`Error in tool ${mcpTool.name}:`, error);
            return {
              content: [{
                type: 'text',
                text: `Error executing ${mcpTool.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
              }],
              isError: true
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

    this.logger.log(`Initialized Claude Agent SDK with ${sdkTools.length} tools`);
  }

  /**
   * WORKFLOW MODE: Full Stock Analysis
   * Creates session, runs analysis with streaming
   */
  async analyzeStock(
    chatId: string,
    ticker: string,
    userPrompt: string,
    options?: AnalysisOptions,
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
      this.sessionManager.completeSession(chatId, executiveSummary, executiveSummary);

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
        this.eventEmitter.emit(createEventName(StreamEventType.COMPLETE, sessionId), {
          ticker,
          timestamp: result.timestamp,
          metadata: result.metadata,
        });
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
    this.logger.log(`Handling conversation for chat ${chatId} with message: ${message.substring(0, 50)}...`);
    const session = this.sessionManager.getActiveSession(chatId) || this.sessionManager.getCompletedSession(chatId);

    if (!session) {
      throw new Error('No active or completed session for conversation');
    }

    const effectiveSessionId = streamId || session.sessionId;

    this.logger.log(`[${effectiveSessionId}] Conversation: ${message.substring(0, 50)}...`);

    // Step 1: Build context from session
    const contextPrompt = this.sessionManager.buildContextPrompt(chatId, message);

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
      this.eventEmitter.emit(createEventName(StreamEventType.COMPLETE, streamId), {
        ticker: session.ticker,
        metadata: {
          analysisDate: new Date().toISOString(),
          framework: FRAMEWORK_VERSION,
          model: this.config.get('ANTHROPIC_MODEL') || DEFAULT_MODEL,
          duration: 0, // Conversation is quick
        },
      });
    }

    return result;
  }

  /**
   * Core Query Executor with Integrated Systems
   * Handles all 7 SDK message types with hooks
   */
  private async executeQuery(params: {
    chatId: string;
    sessionId: string;
    ticker: string;
    prompt: string;
    phase: 'full-analysis' | 'executive-summary' | 'conversation';
    streamToClient: boolean;
  }): Promise<string> {
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
        maxTurns: parseInt(this.config.get('ANTHROPIC_MAX_TURNS') || String(DEFAULT_MAX_TURNS)),
        permissionMode: 'bypassPermissions',
        mcpServers: {
          'stock-analyzer': this.mcpServer,
        },
        includePartialMessages: true,

        // Session-aware hooks using SDK hook events
        hooks: {
          PreToolUse: [{
            hooks: [async (input: any, toolUseID) => {
              // Call our HooksService onToolUse hook for validation and tracking
              const toolUseHook = this.hooksService.createOnToolUseHook(sessionId, chatId);
              try {
                toolUseHook({
                  name: input.tool_name,
                  input: input.tool_input,
                });
              } catch (error) {
                // If hook throws (validation or budget), stop tool execution
                this.logger.error(`PreToolUse hook error: ${error}`);
                return { continue: false, decision: 'block' as const };
              }

              // Return continue to allow tool execution
              return { continue: true };
            }],
          }],
          PostToolUse: [{
            hooks: [async (input: any, toolUseID) => {
              // Call our HooksService onToolResult hook for error enhancement and caching
              const toolResultHook = this.hooksService.createOnToolResultHook(sessionId, chatId);
              toolResultHook({
                tool_use_id: toolUseID || '',
                content: typeof input.tool_response === 'string'
                  ? input.tool_response
                  : JSON.stringify(input.tool_response),
                is_error: input.tool_response?.isError || false,
              });

              return { continue: true };
            }],
          }],
        },
      },
    });

    let pendingPDFToolId: string | undefined;
    const toolInputMap = new Map<string, any>();

    // Process stream with COMPLETE message type handling (all 7 types)
    for await (const message of stream) {
      try {
        // Track message with hooks service for session metrics
        try {
          const onMessageHook = this.hooksService.createOnMessageHook(sessionId, chatId);
          onMessageHook(message as any); // Type cast due to SDK version differences
        } catch (hookError) {
          this.logger.warn(`[${sessionId}] onMessage hook failed:`, hookError);
          // Continue processing - hooks are optional enhancements
        }

        // 1. SDKAssistantMessage - Complete assistant response
        if (message.type === 'assistant') {
          const apiMessage = message.message;
          let content = '';

          for (const block of apiMessage.content) {
            // Text block
            if (block.type === 'text') {
              content += block.text;
            }
            // Thinking block
            else if (block.type === 'thinking') {
              if (streamToClient) {
                this.eventEmitter.emit(createEventName(StreamEventType.THINKING, sessionId), {
                  ticker,
                  message: 'Analyzing data...',
                  timestamp: new Date().toISOString(),
                });
              }
            }
            // Tool use block
            else if (block.type === 'tool_use') {
              toolInputMap.set(block.id, {
                name: block.name,
                input: block.input
              });

              if (isToolName(block.name, ToolName.GENERATE_PDF)) {
                pendingPDFToolId = block.id;
              }

              if (streamToClient) {
                this.eventEmitter.emit(createEventName(StreamEventType.TOOL, sessionId), {
                  ticker,
                  toolName: block.name,
                  toolId: block.id,
                  toolInput: block.input,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }

          // Emit text content ONLY for conversation mode (not for analysis)
          // For analysis, we only want the PDF, not the raw text
          if (streamToClient && content && phase === 'conversation') {
            this.eventEmitter.emit(createEventName(StreamEventType.CHUNK, sessionId), {
              ticker,
              content,
              phase,
              timestamp: new Date().toISOString(),
            });
          }

          fullContent += content;

          // Track tokens
          if (apiMessage.usage) {
            totalTokens += apiMessage.usage.input_tokens + apiMessage.usage.output_tokens;
          }
        }

        // 2. SDKUserMessage - User input/tool results
        else if (message.type === 'user') {
          const apiMessage = message.message;

          for (const block of apiMessage.content) {
            if (block.type === 'tool_result') {
              const toolInfo = toolInputMap.get(block.tool_use_id);

              if (streamToClient) {
                this.eventEmitter.emit(createEventName(StreamEventType.TOOL_RESULT, sessionId), {
                  ticker,
                  toolId: block.tool_use_id,
                  toolName: toolInfo?.name,
                  toolInput: toolInfo?.input,
                  timestamp: new Date().toISOString(),
                });
              }

              // Special handling for PDF
              if (pendingPDFToolId && block.tool_use_id === pendingPDFToolId) {
                try {
                  if (Array.isArray(block.content)) {
                    for (const resultBlock of block.content) {
                      if (resultBlock.type === 'text') {
                        const pdfData = JSON.parse(resultBlock.text);

                        if (pdfData.success && pdfData.pdfBase64 && streamToClient) {
                          this.eventEmitter.emit(createEventName(StreamEventType.PDF, sessionId), {
                            ticker: pdfData.ticker,
                            pdfBase64: pdfData.pdfBase64,
                            fileSize: pdfData.fileSize,
                            reportType: pdfData.reportType,
                            timestamp: new Date().toISOString(),
                          });
                        }
                      }
                    }
                  }
                } catch (e) {
                  this.logger.error('Failed to parse PDF result', e);
                }
                pendingPDFToolId = undefined;
              }
            }
          }
        }

        // 3. SDKResultMessage - Final conversation result
        else if (message.type === 'result') {
          this.logger.log(`[${sessionId}] Analysis result received`);

          if (streamToClient) {
            this.eventEmitter.emit(`analysis.result.${sessionId}`, {
              ticker,
              success: !(message as any).error,
              executionTime: (message as any).executionTimeMs,
              cost: (message as any).costUsd,
              totalTokens: (message as any).totalTokens,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // 4. SDKSystemMessage - System messages (init, compact_boundary)
        else if (message.type === 'system') {
          const systemMessage = message as any;

          if (systemMessage.subtype === 'init') {
            this.logger.log(`[${sessionId}] System initialized`);
            if (streamToClient) {
              this.eventEmitter.emit(`analysis.system.${sessionId}`, {
                ticker,
                model: systemMessage.model,
                permissionMode: systemMessage.permissionMode,
                timestamp: new Date().toISOString(),
              });
            }
          } else if (systemMessage.subtype === 'compact_boundary') {
            this.logger.log(`[${sessionId}] Conversation compacted`);
            if (streamToClient) {
              this.eventEmitter.emit(`analysis.compaction.${sessionId}`, {
                ticker,
                trigger: systemMessage.trigger,
                messagesBefore: systemMessage.originalMessageCount,
                messagesAfter: systemMessage.compactedMessageCount,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }

        // 5. SDKPartialAssistantMessage - Streaming partial updates (stream_event type)
        else if (message.type === 'stream_event') {
          if (streamToClient) {
            this.eventEmitter.emit(`analysis.partial.${sessionId}`, {
              ticker,
              partialContent: (message as any).partialText,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Catch-all for unknown message types
        else {
          this.logger.warn(`[${sessionId}] Unknown message type: ${(message as any).type}`);
        }

      } catch (messageError) {
        this.logger.error(`[${sessionId}] Error processing message:`, messageError);
        // Continue processing other messages
      }
    }

    return fullContent;
  }

  // Helper to convert JSON Schema to Zod schema (preserved from original)
  private convertToZodSchema(jsonSchema: any): any {
    const properties = jsonSchema.properties || {};
    const required = jsonSchema.required || [];
    const zodShape: any = {};

    for (const [key, value] of Object.entries(properties)) {
      const prop = value as any;

      if (prop.type === 'array' && prop.items) {
        const itemSchema = prop.items;
        if (itemSchema.enum && Array.isArray(itemSchema.enum)) {
          const enumValues = itemSchema.enum as [string, ...string[]];
          zodShape[key] = required.includes(key)
            ? z.array(z.enum(enumValues))
            : z.array(z.enum(enumValues)).optional();
        } else if (itemSchema.type === 'number') {
          zodShape[key] = required.includes(key) ? z.array(z.number()) : z.array(z.number()).optional();
        } else {
          zodShape[key] = required.includes(key) ? z.array(z.any()) : z.array(z.any()).optional();
        }
      }
      else if (prop.type === 'string' && prop.enum && Array.isArray(prop.enum)) {
        const enumValues = prop.enum as [string, ...string[]];
        zodShape[key] = required.includes(key)
          ? z.enum(enumValues)
          : z.enum(enumValues).optional();
      }
      else if (prop.type === 'string') {
        zodShape[key] = required.includes(key) ? z.string() : z.string().optional();
      } else if (prop.type === 'number') {
        let numberSchema = z.number();
        if (typeof prop.minimum === 'number') {
          numberSchema = numberSchema.min(prop.minimum);
        }
        if (typeof prop.maximum === 'number') {
          numberSchema = numberSchema.max(prop.maximum);
        }
        zodShape[key] = required.includes(key) ? numberSchema : numberSchema.optional();
      } else if (prop.type === 'object') {
        zodShape[key] = required.includes(key) ? z.object({}).passthrough() : z.object({}).passthrough().optional();
      }
    }

    return zodShape;
  }
}
