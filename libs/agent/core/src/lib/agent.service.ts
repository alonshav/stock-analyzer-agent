import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { STOCK_VALUATION_FRAMEWORK } from './prompts/framework-v2.3';
import { createToolRegistry } from '@stock-analyzer/mcp/tools';
import { z } from 'zod';

export interface AnalysisOptions {
  generatePDF?: boolean;
  focusAreas?: string[];
  peerTickers?: string[];
  investmentHorizon?: string;
}

export interface AnalysisResult {
  ticker: string;
  timestamp: string;
  fullAnalysis: string;
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
  private currentSessionId: string | undefined;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2
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
      // Convert MCP inputSchema to Zod schema dynamically
      const zodSchema = this.convertToZodSchema(mcpTool.inputSchema);

      return tool(
        mcpTool.name,
        mcpTool.description || '',
        zodSchema,
        async (args) => {
          // Emit tool use event using current session ID
          if (this.currentSessionId) {
            this.eventEmitter.emit(`analysis.chunk.${this.currentSessionId}`, {
              type: 'tool_use',
              toolName: mcpTool.name,
              toolInput: args,
              timestamp: new Date().toISOString(),
            });
          }

          const result = await this.toolRegistry.executeTool(mcpTool.name, args);

          // Emit tool result event
          if (this.currentSessionId) {
            this.eventEmitter.emit(`analysis.chunk.${this.currentSessionId}`, {
              type: 'tool_result',
              toolName: mcpTool.name,
              result: typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200),
              timestamp: new Date().toISOString(),
            });
          }

          return result;
        }
      );
    });

    // Create SDK MCP server with converted tools
    this.mcpServer = createSdkMcpServer({
      name: 'stock-analyzer-tools',
      version: '1.0.0',
      tools: sdkTools,
    });

    this.logger.log(`Initialized Claude Agent SDK with ${sdkTools.length} tools`);
  }

  async analyzeStock(
    ticker: string,
    userPrompt: string,
    options?: AnalysisOptions,
    sessionId?: string
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    this.logger.log(`Starting analysis for ${ticker}`);

    // Phase 1: Full Analysis Query
    this.logger.log('Phase 1: Generating full analysis...');
    const fullAnalysis = await this.executeQuery(
      ticker,
      userPrompt,
      sessionId,
      'full-analysis'
    );

    // Phase 2: Executive Summary Query
    this.logger.log('Phase 2: Generating executive summary...');
    const summaryPrompt = `Based on the following analysis, create a concise executive summary (2-3 paragraphs):\n\n${fullAnalysis}`;

    const executiveSummary = await this.executeQuery(
      ticker,
      summaryPrompt,
      sessionId,
      'executive-summary'
    );

    const duration = Date.now() - startTime;

    const result: AnalysisResult = {
      ticker,
      timestamp: new Date().toISOString(),
      fullAnalysis,
      executiveSummary,
      metadata: {
        analysisDate: new Date().toISOString(),
        framework: 'v2.3',
        model: this.config.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514',
        duration,
      },
    };

    if (sessionId) {
      this.eventEmitter.emit(`analysis.complete.${sessionId}`, result);
    }

    this.logger.log(`Analysis complete for ${ticker} (${duration}ms)`);
    return result;
  }

  // Helper to convert JSON Schema to Zod schema
  private convertToZodSchema(jsonSchema: any): any {
    // Converts JSON Schema to Zod schema while preserving enum constraints
    const properties = jsonSchema.properties || {};
    const required = jsonSchema.required || [];

    const zodShape: any = {};

    for (const [key, value] of Object.entries(properties)) {
      const prop = value as any;

      // Handle array types
      if (prop.type === 'array' && prop.items) {
        const itemSchema = prop.items;

        // Handle array of enums (preserves exact values)
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
      // Handle string types with enums
      else if (prop.type === 'string' && prop.enum && Array.isArray(prop.enum)) {
        const enumValues = prop.enum as [string, ...string[]];
        zodShape[key] = required.includes(key)
          ? z.enum(enumValues)
          : z.enum(enumValues).optional();
      }
      // Handle basic types
      else if (prop.type === 'string') {
        zodShape[key] = required.includes(key) ? z.string() : z.string().optional();
      } else if (prop.type === 'number') {
        // Handle min/max constraints
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

  private async executeQuery(
    ticker: string,
    prompt: string,
    sessionId: string | undefined,
    phase: string
  ): Promise<string> {
    let fullContent = '';

    // Set current session ID for tool execution events
    this.currentSessionId = sessionId;

    try {
      const stream = query({
        prompt,
        options: {
          systemPrompt: STOCK_VALUATION_FRAMEWORK,
          model: this.config.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514',
          maxTurns: parseInt(this.config.get('ANTHROPIC_MAX_TURNS') || '20'),
          permissionMode: 'bypassPermissions', // Auto-approve all tool use
          mcpServers: {
            'stock-analyzer': this.mcpServer,
          },
        },
      });

      for await (const message of stream) {
        // Log message type for debugging
        this.logger.debug(`Stream message type: ${message.type}`);

        // Handle assistant messages
        if (message.type === 'assistant') {
          // Extract text content from message.message.content
          const apiMessage = message.message;
          let content = '';

          if (Array.isArray(apiMessage.content)) {
            // Process each content block
            for (const block of apiMessage.content) {
              if (block.type === 'text') {
                content += block.text;
              }
              // Note: tool_use blocks are handled by the tool execution wrapper
            }
          }

          // Only emit streaming events during thought process (full-analysis phase)
          if (sessionId && phase === 'full-analysis' && content) {
            this.eventEmitter.emit(`analysis.chunk.${sessionId}`, {
              ticker,
              type: 'text',
              content,
              phase,
              timestamp: new Date().toISOString(),
            });
          }

          fullContent += content;
        }
      }

      return fullContent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in executeQuery: ${errorMessage}`, errorStack);
      throw error;
    } finally {
      // Clear current session ID
      this.currentSessionId = undefined;
    }
  }
}
