import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { SSEClientService } from '@stock-analyzer/bot/stream-client';
import { SessionOrchestrator } from '@stock-analyzer/bot/sessions';
import { WorkflowType, StreamEventType } from '@stock-analyzer/shared/types';
import { TelegramFormatterService } from './formatters/telegram-formatter.service';
import { ToolEventFormatterService } from './formatters/tool-event-formatter.service';

/**
 * Stream Configuration
 */
interface StreamConfig {
  chatId: string;
  ctx: Context;
  agentUrl: string;
  workflowRequest: {
    sessionId: string;
    workflowType: WorkflowType;
    params: {
      ticker: string;
      userPrompt?: string;
      additionalContext?: Record<string, unknown>;
    };
  };
}

/**
 * StreamManagerService - Orchestrates SSE Streams from Agent to Telegram
 *
 * SINGLE RESPONSIBILITY: Coordinate streaming analysis from Agent to Telegram Bot
 *
 * Delegates:
 * - SSE connection management → SSEClientService
 * - Message formatting → TelegramFormatterService
 * - Tool event formatting → ToolEventFormatterService
 * - Session management → SessionOrchestrator
 *
 * Handles:
 * - Event routing from Agent to Telegram
 * - Content buffering for session persistence
 * - Stream lifecycle (start, stop, cleanup)
 */
@Injectable()
export class StreamManagerService {
  private readonly logger = new Logger(StreamManagerService.name);
  private readonly activeClients = new Map<string, SSEClientService>();
  private readonly streamBuffers = new Map<string, string>();

  constructor(
    private readonly sessionOrchestrator: SessionOrchestrator,
    private readonly telegramFormatter: TelegramFormatterService,
    private readonly toolEventFormatter: ToolEventFormatterService
  ) {}

  /**
   * Start workflow stream - generic streaming method
   *
   * Caller provides complete workflow request configuration
   */
  async startStream(config: StreamConfig): Promise<void> {
    const { chatId, ctx, agentUrl, workflowRequest } = config;

    this.logger.log(
      `[${workflowRequest.params.ticker}] Starting stream for session ${workflowRequest.sessionId}`
    );

    // Create SSE client
    const client = new SSEClientService(chatId);
    this.activeClients.set(chatId, client);
    this.streamBuffers.set(chatId, '');

    // Set up event handlers
    this.setupEventHandlers(client, ctx, chatId);

    // Connect to Agent's workflow endpoint with caller-provided configuration
    client.connect({
      url: `${agentUrl}/api/workflow`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(workflowRequest),
    });
  }

  /**
   * Start conversation stream for follow-up questions
   *
   * Convenience method that builds workflow request for conversations
   */
  async startConversation(chatId: string, message: string, ctx: Context, agentUrl: string): Promise<void> {
    // Get completed session from orchestrator
    const session = this.sessionOrchestrator.getCompletedSession(chatId);
    if (!session) {
      throw new Error('No completed session found for chat ' + chatId);
    }

    this.logger.log(`[${session.ticker}] Starting conversation for session ${session.sessionId}`);

    // Add user message to conversation history
    this.sessionOrchestrator.addUserMessage(chatId, message);

    // Use the generic startStream method with conversation-specific configuration
    await this.startStream({
      chatId,
      ctx,
      agentUrl,
      workflowRequest: {
        sessionId: session.sessionId,
        workflowType: WorkflowType.CONVERSATION,
        params: {
          ticker: session.ticker,
          userPrompt: message,
          additionalContext: {
            conversationHistory: this.sessionOrchestrator.getConversationHistory(chatId),
          },
        },
      },
    });
  }

  /**
   * Setup event handlers for SSE client
   */
  private setupEventHandlers(client: SSEClientService, ctx: Context, chatId: string): void {
    // Handle CONNECTED event
    client.on(StreamEventType.CONNECTED, (data) => {
      this.logger.log(`Stream connected: ${data.sessionId}`);
    });

    // Handle CHUNK event (streaming text)
    client.on(StreamEventType.CHUNK, async (data) => {
      if (data.content) {
        const currentBuffer = this.streamBuffers.get(chatId) || '';
        this.streamBuffers.set(chatId, currentBuffer + data.content);
        await this.telegramFormatter.sendLongMessage(ctx, data.content, true);
      }
    });

    // Handle PARTIAL event
    client.on(StreamEventType.PARTIAL, async (data) => {
      if (data.partialContent) {
        await this.telegramFormatter.sendLongMessage(ctx, data.partialContent, true);
      }
    });

    // Handle THINKING event
    client.on(StreamEventType.THINKING, async () => {
      try {
        await ctx.reply('💭 Thinking...');
        await ctx.sendChatAction('typing');
      } catch (error) {
        this.logger.error('Failed to send thinking message:', error);
      }
    });

    // Handle TOOL event (tool call notification)
    client.on(StreamEventType.TOOL, async (data) => {
      const message = this.toolEventFormatter.formatToolCall(data);
      try {
        await ctx.reply(message);
        await ctx.sendChatAction('typing');
      } catch (error) {
        this.logger.error('Failed to send tool message:', error);
      }
    });

    // Handle TOOL_RESULT event
    client.on(StreamEventType.TOOL_RESULT, async (data) => {
      const message = this.toolEventFormatter.formatToolResult(data);
      try {
        await ctx.reply(message);
      } catch (error) {
        this.logger.error('Failed to send tool result message:', error);
      }
    });

    // Handle PDF event
    client.on(StreamEventType.PDF, async (data) => {
      this.logger.log(`Received PDF: ${data.fileSize} bytes`);
      try {
        const pdfBuffer = Buffer.from(data.pdfBase64, 'base64');
        const filename = `${data.ticker}_${data.reportType}_analysis.pdf`;

        const chatId = ctx.chat?.id;
        if (!chatId) {
          throw new Error('Chat ID not available');
        }

        await ctx.telegram.sendDocument(
          chatId,
          {
            source: pdfBuffer,
            filename: filename,
          },
          {
            caption: `📄 ${data.ticker} ${data.reportType === 'full' ? 'Full Analysis' : 'Executive Summary'} Report\n` +
                     `File size: ${Math.round(data.fileSize / 1024)}KB`,
          }
        );

        this.logger.log(`PDF sent successfully`);
      } catch (error) {
        this.logger.error(`Failed to send PDF:`, error);
        await ctx.reply(`⚠️ PDF generated but failed to send. Size: ${Math.round(data.fileSize / 1024)}KB`);
      }
    });

    // Handle COMPLETE event
    client.on(StreamEventType.COMPLETE, async (data) => {
      const duration = Math.round(data.metadata.duration / 1000);

      // Save analysis results to SessionOrchestrator
      const fullAnalysis = this.streamBuffers.get(chatId) || '';
      this.sessionOrchestrator.completeSession(chatId, fullAnalysis, fullAnalysis);

      await ctx.reply(
        `✅ Analysis complete!\n\n` +
        `⏱️ Duration: ${duration}s\n` +
        `🤖 Model: ${data.metadata.model}\n\n` +
        `💬 You can now ask follow-up questions!`
      );

      this.cleanup(chatId);
    });

    // Handle ERROR event
    client.on(StreamEventType.ERROR, async (data) => {
      await ctx.reply(`❌ Error: ${data.message}`);
      this.cleanup(chatId);
    });

    // Handle connection close
    client.on('close', () => {
      this.logger.log(`Connection closed for chat ${chatId}`);
      this.cleanup(chatId);
    });

    // Handle connection error
    client.on('error', async (error) => {
      this.logger.error('SSE error:', error);
      await ctx.reply('❌ Connection lost. Please try again.');
      this.cleanup(chatId);
    });
  }

  /**
   * Stop streaming for a chat
   */
  stopStream(chatId: string): boolean {
    const client = this.activeClients.get(chatId);
    if (client) {
      this.cleanup(chatId);
      return true;
    }
    return false;
  }

  /**
   * Check if chat has active stream
   */
  hasActiveStream(chatId: string): boolean {
    return this.activeClients.has(chatId);
  }

  /**
   * Check if chat has active session
   */
  hasActiveSession(chatId: string): boolean {
    return this.sessionOrchestrator.hasActiveSession(chatId) ||
           this.sessionOrchestrator.hasCompletedSession(chatId);
  }

  /**
   * Get session status
   */
  getSessionStatus(chatId: string): { ticker: string; status: string; startedAt: string } | null {
    const session = this.sessionOrchestrator.getActiveSession(chatId) ||
                    this.sessionOrchestrator.getCompletedSession(chatId);

    if (!session) return null;

    return {
      ticker: session.ticker,
      status: session.status,
      startedAt: session.createdAt.toISOString(),
    };
  }

  /**
   * Cleanup resources
   */
  private cleanup(chatId: string): void {
    const client = this.activeClients.get(chatId);
    if (client) {
      client.disconnect();
      client.removeAllListeners();
      this.activeClients.delete(chatId);
    }

    this.streamBuffers.delete(chatId);
  }
}
