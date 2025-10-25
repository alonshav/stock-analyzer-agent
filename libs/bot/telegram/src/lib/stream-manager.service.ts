import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { SSEClientService } from '@stock-analyzer/bot/stream-client';
import { SessionOrchestrator, MessageRole } from '@stock-analyzer/bot/sessions';
import { WorkflowType, StreamEventType } from '@stock-analyzer/shared/types';
import { BotMessages } from '@stock-analyzer/bot/common';
import { TelegramFormatterService } from './formatters/telegram-formatter.service';
import { ToolEventFormatterService } from './formatters/tool-event-formatter.service';
import { BotMessagingService } from './bot-messaging.service';

/**
 * StreamManagerService - Orchestrates SSE Streams from Agent to Telegram
 *
 * NEW ARCHITECTURE:
 * - Provides high-level methods: executeWorkflow() and executeConversation()
 * - Bot calls single method, service handles all orchestration
 * - Manages session lifecycle, workflow tracking, and streaming
 * - Hides implementation details from bot layer
 */
@Injectable()
export class StreamManagerService {
  private readonly logger = new Logger(StreamManagerService.name);
  private readonly activeClients = new Map<string, SSEClientService>();
  private readonly streamBuffers = new Map<string, string>();
  private readonly activeResponses = new Set<string>();
  private readonly workflowIds = new Map<string, string>(); // chatId -> workflowId
  private readonly handledErrors = new Set<string>(); // Guard against duplicate error handling

  constructor(
    private readonly sessionOrchestrator: SessionOrchestrator,
    private readonly telegramFormatter: TelegramFormatterService,
    private readonly toolEventFormatter: ToolEventFormatterService,
    private readonly botMessaging: BotMessagingService
  ) {}

  /**
   * Execute Workflow - High-level method for bot
   *
   * Bot calls this single method. Service handles:
   * - Session management (get or create)
   * - Workflow tracking
   * - Responding state management
   * - Stream execution
   */
  async executeWorkflow(
    chatId: string,
    workflowType: WorkflowType,
    ticker: string,
    ctx: Context,
    agentUrl: string
  ): Promise<void> {
    // 1. Get or create session
    const session = this.sessionOrchestrator.getOrCreateSession(chatId);
    const sessionId = session.sessionId;

    this.logger.log(
      `[${chatId}] Executing workflow ${workflowType} for ${ticker} (session: ${sessionId})`
    );

    // 2. Track initial workflow request in conversation history
    this.botMessaging.trackUserMessage(chatId, `Analyze ${ticker} stock`);

    // 3. Track workflow execution
    const workflowId = this.sessionOrchestrator.trackWorkflow(
      chatId,
      workflowType,
      ticker
    );
    this.workflowIds.set(chatId, workflowId);

    // 4. Mark as responding
    this.startResponding(chatId);

    // 5. Start workflow stream (internal method)
    await this.startWorkflowStream(
      workflowType,
      sessionId,
      ticker,
      ctx,
      chatId,
      agentUrl
    );
  }

  /**
   * Execute Conversation - High-level method for bot
   *
   * Bot calls this single method. Service handles:
   * - Session management (get or create)
   * - Message history tracking
   * - Responding state management
   * - Stream execution
   */
  async executeConversation(
    chatId: string,
    userMessage: string,
    ctx: Context,
    agentUrl: string
  ): Promise<void> {
    // 1. Get or create session
    const session = this.sessionOrchestrator.getOrCreateSession(chatId);
    const sessionId = session.sessionId;
    const conversationHistory = session.conversationHistory;

    this.logger.log(
      `[${chatId}] Executing conversation (session: ${sessionId}, history: ${conversationHistory.length} messages)`
    );

    // 2. Add user message to history
    this.botMessaging.trackUserMessage(chatId, userMessage);

    // 3. Mark as responding
    this.startResponding(chatId);

    // 4. Start conversation stream (internal method)
    await this.startConversationStream(
      sessionId,
      chatId,
      userMessage,
      conversationHistory,
      ctx,
      agentUrl
    );
  }

  /**
   * INTERNAL: Start workflow stream
   * Handles SSE connection to Agent's workflow endpoint
   */
  private async startWorkflowStream(
    workflowType: WorkflowType,
    sessionId: string,
    ticker: string,
    ctx: Context,
    chatId: string,
    agentUrl: string
  ): Promise<void> {
    // Create SSE client
    const client = new SSEClientService(chatId);
    this.activeClients.set(chatId, client);
    this.streamBuffers.set(chatId, '');

    // Set up event handlers
    this.setupWorkflowEventHandlers(client, ctx, chatId, ticker);

    // Connect to Agent's workflow endpoint
    client.connect({
      url: `${agentUrl}/api/workflow`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        sessionId,
        workflowType,
        params: {
          ticker,
          userPrompt: 'Perform comprehensive stock analysis',
        },
      }),
    });
  }

  /**
   * INTERNAL: Start conversation stream
   * Handles SSE connection to Agent's conversation endpoint
   */
  private async startConversationStream(
    sessionId: string,
    chatId: string,
    userMessage: string,
    conversationHistory: Array<{ role: MessageRole; content: string; timestamp: Date }>,
    ctx: Context,
    agentUrl: string
  ): Promise<void> {
    // Create SSE client
    const client = new SSEClientService(chatId);
    this.activeClients.set(chatId, client);
    this.streamBuffers.set(chatId, '');

    // Set up event handlers
    this.setupConversationEventHandlers(client, ctx, chatId);

    // Connect to Agent's conversation endpoint
    client.connect({
      url: `${agentUrl}/api/conversation`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        sessionId,
        userMessage,
        conversationHistory: conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
        })),
      }),
    });
  }

  /**
   * Setup event handlers for workflow streams
   */
  private setupWorkflowEventHandlers(
    client: SSEClientService,
    ctx: Context,
    chatId: string,
    ticker: string
  ): void {
    // Handle CONNECTED event
    client.on(StreamEventType.CONNECTED, (data) => {
      this.logger.log(`Workflow stream connected: ${data.sessionId}`);
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
        const message = '💭 Thinking...';
        await this.botMessaging.sendAndTrack(ctx, chatId, message);
        await this.botMessaging.sendTypingAction(ctx);
      } catch (error) {
        this.logger.error('Failed to send thinking message:', error);
      }
    });

    // Handle TOOL event (tool call notification)
    client.on(StreamEventType.TOOL, async (data) => {
      const message = this.toolEventFormatter.formatToolCall(data);
      try {
        await this.botMessaging.sendAndTrack(ctx, chatId, message);
        await this.botMessaging.sendTypingAction(ctx);
      } catch (error) {
        this.logger.error('Failed to send tool message:', error);
      }
    });

    // Handle TOOL_RESULT event
    client.on(StreamEventType.TOOL_RESULT, async (data) => {
      const message = this.toolEventFormatter.formatToolResult(data);
      try {
        await this.botMessaging.sendAndTrack(ctx, chatId, message);
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

        const caption = `📄 ${data.ticker} ${data.reportType === 'full' ? 'Full Analysis' : 'Executive Summary'} Report\nFile size: ${Math.round(data.fileSize / 1024)}KB`;

        await this.botMessaging.sendDocumentAndTrack(
          ctx,
          chatId,
          pdfBuffer,
          filename,
          caption
        );

        this.logger.log(`PDF sent successfully`);
      } catch (error) {
        this.logger.error(`Failed to send PDF:`, error);
        await this.botMessaging.sendAndTrack(
          ctx,
          chatId,
          `⚠️ PDF generated but failed to send. Size: ${Math.round(data.fileSize / 1024)}KB`
        );
      }
    });

    // Handle COMPLETE event
    client.on(StreamEventType.COMPLETE, async (data) => {
      const duration = Math.round(data.metadata.duration / 1000);
      const fullAnalysis = this.streamBuffers.get(chatId) || '';

      // Mark workflow as completed
      // Note: completeWorkflow() also adds analysis to conversation history
      const workflowId = this.workflowIds.get(chatId);
      if (workflowId) {
        this.sessionOrchestrator.completeWorkflow(chatId, workflowId, fullAnalysis);
        this.workflowIds.delete(chatId);
      }

      await this.botMessaging.sendAndTrack(
        ctx,
        chatId,
        `✅ Analysis complete!\n\n` +
        `⏱️ Duration: ${duration}s\n` +
        `🤖 Model: ${data.metadata.model}\n\n` +
        `💬 You can now ask follow-up questions!`
      );

      // Session stays ACTIVE (don't complete session)
      this.stopResponding(chatId);
      this.cleanup(chatId);
    });

    // Handle ERROR event
    client.on(StreamEventType.ERROR, async (data) => {
      // Guard: prevent duplicate error handling
      if (this.handledErrors.has(chatId)) {
        this.logger.debug(`[${chatId}] Error already handled, skipping duplicate`);
        return;
      }
      this.handledErrors.add(chatId);

      await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.ANALYSIS_FAILED(ticker));
      this.stopResponding(chatId);
      this.cleanup(chatId);
    });

    // Handle connection close
    client.on('close', () => {
      this.logger.log(`Connection closed for chat ${chatId}`);
      // Don't send error message on clean close - just cleanup
      if (!this.handledErrors.has(chatId)) {
        this.stopResponding(chatId);
        this.cleanup(chatId);
      }
    });

    // Handle connection error
    client.on('error', async (error) => {
      this.logger.error('SSE error:', error);

      // Guard: prevent duplicate error handling
      if (this.handledErrors.has(chatId)) {
        this.logger.debug(`[${chatId}] Error already handled, skipping duplicate`);
        return;
      }
      this.handledErrors.add(chatId);

      await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.ANALYSIS_FAILED(ticker));
      this.stopResponding(chatId);
      this.cleanup(chatId);
    });
  }

  /**
   * Setup event handlers for conversation streams
   */
  private setupConversationEventHandlers(
    client: SSEClientService,
    ctx: Context,
    chatId: string
  ): void {
    // Handle CONNECTED event
    client.on(StreamEventType.CONNECTED, (data) => {
      this.logger.log(`Conversation stream connected: ${data.sessionId}`);
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
        await ctx.sendChatAction('typing');
      } catch (error) {
        this.logger.error('Failed to send typing action:', error);
      }
    });

    // Handle TOOL event (tool call notification)
    client.on(StreamEventType.TOOL, async (data) => {
      const message = this.toolEventFormatter.formatToolCall(data);
      try {
        await this.botMessaging.sendAndTrack(ctx, chatId, message);
        await this.botMessaging.sendTypingAction(ctx);
      } catch (error) {
        this.logger.error('Failed to send tool message:', error);
      }
    });

    // Handle TOOL_RESULT event
    client.on(StreamEventType.TOOL_RESULT, async (data) => {
      const message = this.toolEventFormatter.formatToolResult(data);
      try {
        await this.botMessaging.sendAndTrack(ctx, chatId, message);
      } catch (error) {
        this.logger.error('Failed to send tool result message:', error);
      }
    });

    // Handle COMPACTION event
    client.on(StreamEventType.COMPACTION, async () => {
      try {
        await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.CONTEXT_COMPACTED);
      } catch (error) {
        this.logger.error('Failed to send compaction message:', error);
      }
    });

    // Handle COMPLETE event
    client.on(StreamEventType.COMPLETE, async () => {
      const finalResponse = this.streamBuffers.get(chatId) || '';

      // Track final streaming response in conversation history
      // Note: Text was already sent via CHUNK events, just tracking here
      this.botMessaging.trackAssistantMessage(chatId, finalResponse);

      // Session stays ACTIVE (don't complete session)
      this.stopResponding(chatId);
      this.cleanup(chatId);
    });

    // Handle ERROR event
    client.on(StreamEventType.ERROR, async (data) => {
      // Guard: prevent duplicate error handling
      if (this.handledErrors.has(chatId)) {
        this.logger.debug(`[${chatId}] Error already handled, skipping duplicate`);
        return;
      }
      this.handledErrors.add(chatId);

      await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.CONVERSATION_FAILED);
      this.stopResponding(chatId);
      this.cleanup(chatId);
    });

    // Handle connection close
    client.on('close', () => {
      this.logger.log(`Connection closed for chat ${chatId}`);
      // Don't send error message on clean close - just cleanup
      if (!this.handledErrors.has(chatId)) {
        this.stopResponding(chatId);
        this.cleanup(chatId);
      }
    });

    // Handle connection error
    client.on('error', async (error) => {
      this.logger.error('SSE error:', error);

      // Guard: prevent duplicate error handling
      if (this.handledErrors.has(chatId)) {
        this.logger.debug(`[${chatId}] Error already handled, skipping duplicate`);
        return;
      }
      this.handledErrors.add(chatId);

      await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.CONVERSATION_FAILED);
      this.stopResponding(chatId);
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
   * Check if bot is currently responding to user
   */
  isResponding(chatId: string): boolean {
    return this.activeResponses.has(chatId);
  }

  /**
   * Mark that bot started responding
   */
  startResponding(chatId: string): void {
    this.activeResponses.add(chatId);
    this.logger.log(`[${chatId}] Started responding`);
  }

  /**
   * Mark that bot stopped responding
   */
  stopResponding(chatId: string): void {
    this.activeResponses.delete(chatId);
    this.logger.log(`[${chatId}] Stopped responding`);
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
    this.workflowIds.delete(chatId);
    this.handledErrors.delete(chatId); // Clean up error guard
  }
}
