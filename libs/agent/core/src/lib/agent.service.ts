/**
 * Stateless AgentService with Workflow Support
 *
 * Key Changes from Previous Version:
 * - Removed SessionManager dependency (Bot owns sessions now)
 * - Added WorkflowService for workflow configs
 * - Single method: executeWorkflow(sessionId, workflowType, params)
 * - Receives sessionId from caller (Bot), never creates sessions
 * - Uses workflow registry for system prompts and configs
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
import { createToolRegistry } from '@stock-analyzer/mcp/tools';
import { z } from 'zod';
import {
  StreamEventType,
  ToolName,
  isToolName,
  WorkflowType,
  WorkflowParams,
} from '@stock-analyzer/shared/types';
import { WorkflowService } from './workflows';

export interface AnalysisResult {
  sessionId: string;
  ticker: string;
  timestamp: string;
  executiveSummary: string;
  metadata: {
    analysisDate: string;
    workflowType: string;
    model: string;
    duration: number;
  };
}

interface ExecuteQueryParams {
  sessionId: string;
  ticker: string;
  prompt: string;
  workflowType: WorkflowType;
  streamToClient: boolean;
}

interface ToolResultData {
  toolId: string;
  toolName: string;
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  block: any; // The raw tool_result block
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly toolRegistry;
  private readonly mcpServer;
  private readonly toolUseIdToName = new Map<string, string>();

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private workflowService: WorkflowService
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
   * Execute Workflow - The ONLY public method
   *
   * Bot creates session and calls this method with sessionId.
   * Agent executes workflow and streams results.
   * Bot listens to stream events and manages session lifecycle.
   *
   * @param sessionId - Session ID from Bot (Bot created it)
   * @param workflowType - Type of workflow to execute
   * @param params - Workflow parameters (ticker, prompt, context)
   * @returns Analysis result with metadata
   */
  async executeWorkflow(
    sessionId: string,
    workflowType: WorkflowType,
    params: WorkflowParams
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    const { ticker } = params;

    this.logger.log(
      `[${sessionId}] Starting workflow ${workflowType} for ${ticker}`
    );

    try {
      // Build user prompt using WorkflowService
      const userPrompt = this.workflowService.buildUserPrompt(
        workflowType,
        params
      );

      // Execute query with streaming
      const executiveSummary = await this.executeQuery({
        sessionId,
        ticker,
        prompt: userPrompt,
        workflowType,
        streamToClient: true,
      });

      // Build result
      const duration = Date.now() - startTime;
      const workflowConfig = this.workflowService.getConfig(workflowType);
      const result: AnalysisResult = {
        sessionId,
        ticker,
        timestamp: new Date().toISOString(),
        executiveSummary,
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType,
          model: workflowConfig.model,
          duration,
        },
      };

      // Emit completion event
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.COMPLETE,
        sessionId,
        ticker,
        timestamp: result.timestamp,
        metadata: result.metadata,
      });

      this.logger.log(
        `[${sessionId}] Workflow complete for ${ticker} (${duration}ms)`
      );
      return result;
    } catch (error) {
      this.logger.error(`[${sessionId}] Workflow failed:`, error);

      // Emit error event
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.ERROR,
        sessionId,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Core Query Executor
   * Handles all 7 SDK message types with debug logging
   */
  private async executeQuery(params: ExecuteQueryParams): Promise<string> {
    const { sessionId, ticker, prompt, workflowType, streamToClient } = params;

    let fullContent = '';
    let totalTokens = 0;

    // Get workflow config
    const workflowConfig = this.workflowService.getConfig(workflowType);

    // Create SDK query with workflow-specific config
    const stream = query({
      prompt,
      options: {
        systemPrompt: workflowConfig.systemPrompt,
        model: workflowConfig.model,
        maxThinkingTokens: workflowConfig.maxThinkingTokens,
        maxTurns: workflowConfig.maxTurns,
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
                    `[${sessionId}] Session started for workflow ${workflowType}`
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
              workflowType,
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
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.SYSTEM,
        sessionId,
        ticker,
        model: initMessage.model,
        permissionMode: initMessage.permissionMode,
        timestamp: new Date().toISOString(),
      });
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
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.COMPACTION,
        sessionId,
        ticker,
        trigger,
        messagesBefore: preTokens,
        messagesAfter: 0,
        timestamp: new Date().toISOString(),
      });
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
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.PARTIAL,
        sessionId,
        ticker,
        partialContent: partialText,
        deltaType,
        timestamp: new Date().toISOString(),
      });
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
    workflowType: WorkflowType | string,
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
          this.eventEmitter.emit(`stream.${sessionId}`, {
            type: StreamEventType.THINKING,
            sessionId,
            ticker,
            message: block.thinking,
            timestamp: new Date().toISOString(),
          });
        }
      } else if (block.type === 'tool_use') {
        // Track tool use ID to name mapping for later retrieval
        this.toolUseIdToName.set(block.id, block.name);

        if (streamToClient) {
          this.eventEmitter.emit(`stream.${sessionId}`, {
            type: StreamEventType.TOOL,
            sessionId,
            ticker,
            toolName: block.name,
            toolId: block.id,
            toolInput: block.input,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Emit chunk event
    if (streamToClient) {
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.CHUNK,
        sessionId,
        ticker,
        content: textContent,
        phase: workflowType,
        timestamp: new Date().toISOString(),
      });
    }

    return textContent;
  }

  /**
   * Handle user message (tool results)
   * Processes tool results and delegates to specific handlers
   */
  private handleUserMessage(
    userMessage: SDKUserMessage,
    sessionId: string,
    ticker: string,
    streamToClient: boolean
  ): void {
    const apiMessage = userMessage.message;

    // Extract all tool results from content blocks
    const toolResults = this.extractToolResults(apiMessage);

    // Process each tool result
    for (const result of toolResults) {
      this.processToolResultBlock(result, sessionId, ticker, streamToClient);
    }

    // Log summary
    this.logToolResultsSummary(toolResults, sessionId);
  }

  /**
   * Extract tool results from message content blocks
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractToolResults(apiMessage: any): ToolResultData[] {
    const results: ToolResultData[] = [];

    for (const block of apiMessage.content) {
      if (block.type === 'tool_result') {
        const toolName =
          this.toolUseIdToName.get(block.tool_use_id) || 'unknown';
        results.push({
          toolId: block.tool_use_id,
          toolName,
          success: !(block.is_error || false),
          block,
        });
      }
    }

    return results;
  }

  /**
   * Process a single tool result: handle tool-specific logic, emit events, clean up
   */
  private processToolResultBlock(
    result: ToolResultData,
    sessionId: string,
    ticker: string,
    streamToClient: boolean
  ): void {
    // Process tool-specific results (e.g., PDF generation)
    if (streamToClient && result.success) {
      this.processToolResult(result.toolName, result.block, sessionId, ticker);
    }

    // Emit generic tool result event
    if (streamToClient) {
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.TOOL_RESULT,
        sessionId,
        ticker,
        toolId: result.toolId,
        timestamp: new Date().toISOString(),
      });
    }

    // Clean up tracking map
    this.toolUseIdToName.delete(result.toolId);
  }

  /**
   * Log summary of all tool results
   */
  private logToolResultsSummary(
    results: ToolResultData[],
    sessionId: string
  ): void {
    if (results.length === 0) return;

    this.logger.log(`[${sessionId}] 📥 Tool Results (${results.length})`);
    results.forEach((r) => {
      const status = r.success ? '✅' : '❌';
      this.logger.log(
        `[${sessionId}]    ${status} ${r.toolName} (${r.toolId})`
      );
    });
  }

  /**
   * Process tool-specific results and emit specialized events
   * Routes to handlers based on tool name
   */
  private processToolResult(
    toolName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    block: any,
    sessionId: string,
    ticker: string
  ): void {
    this.logger.debug(
      `[${sessionId}] processToolResult called - toolName: "${toolName}"`
    );

    // Parse tool result content
    const toolResultData = this.parseToolResultContent(block);
    if (!toolResultData) {
      this.logger.debug(
        `[${sessionId}] Could not parse tool result as JSON - skipping specialized handling`
      );
      return; // Not parseable JSON
    }

    // Route to specific handlers based on tool name (using isToolName helper)
    if (isToolName(toolName, ToolName.GENERATE_PDF)) {
      this.logger.debug(
        `[${sessionId}] Tool name matches GENERATE_PDF - calling PDF handler`
      );
      this.handlePdfToolResult(toolResultData, sessionId, ticker);
    } else {
      this.logger.debug(
        `[${sessionId}] Tool name "${toolName}" does not match GENERATE_PDF`
      );
    }

    // Easy to extend with more handlers:
    // else if (isToolName(toolName, ToolName.CALCULATE_DCF)) {
    //   this.handleDcfToolResult(toolResultData, sessionId, ticker);
    // }
  }

  /**
   * Parse tool result content from text blocks
   * Returns parsed JSON data or null if not parseable
   */
  private parseToolResultContent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    block: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any | null {
    if (!Array.isArray(block.content)) {
      return null;
    }

    for (const contentBlock of block.content) {
      if (contentBlock.type === 'text') {
        try {
          return JSON.parse(contentBlock.text);
        } catch {
          // Not JSON - continue checking other content blocks
        }
      }
    }

    return null;
  }

  /**
   * Handle PDF tool result - emit PDF event for downstream processing
   */
  private handlePdfToolResult(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolResultData: any,
    sessionId: string,
    ticker: string
  ): void {
    this.logger.log(
      `[${sessionId}] 📄 PDF detected - Size: ${
        toolResultData.fileSize || 0
      } bytes, Type: ${toolResultData.reportType || 'unknown'}`
    );

    this.eventEmitter.emit(`stream.${sessionId}`, {
      type: StreamEventType.PDF,
      sessionId,
      ticker,
      pdfBase64: toolResultData.pdfBase64,
      fileSize: toolResultData.fileSize,
      reportType: toolResultData.reportType,
      timestamp: new Date().toISOString(),
    });
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
      this.eventEmitter.emit(`stream.${sessionId}`, {
        type: StreamEventType.RESULT,
        sessionId,
        ticker,
        success: isSuccess,
        executionTime,
        cost,
        totalTokens,
        timestamp: new Date().toISOString(),
      });
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
