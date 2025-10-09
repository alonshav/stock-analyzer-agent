import { Injectable, Logger } from '@nestjs/common';
import { EventSource } from 'eventsource';
import { Context } from 'telegraf';
import {
  StreamEventType,
  ToolName,
  isToolName,
  FinancialDataType,
  FinancialDataTypeLabel,
  ReportType,
  ReportTypeLabel,
  PeriodType,
  TimeConstants,
  TelegramLimits,
  FRAMEWORK_VERSION
} from '@stock-analyzer/shared/types';

interface StreamConfig {
  chatId: string;
  ticker: string;
  ctx: Context;
  messageId: number;
  agentUrl: string;
}

interface ConversationConfig {
  chatId: string;
  message: string;
  ctx: Context;
  messageId: number;
  agentUrl: string;
}

interface SessionInfo {
  ticker: string;
  status: string;
  startedAt: string;
}

interface ChunkEvent {
  type: 'chunk';
  ticker: string;
  content: string;
  phase: string;
  timestamp: string;
}

interface ToolEvent {
  type: 'tool';
  ticker: string;
  toolName: string;
  toolId: string;
  toolInput?: any;
  timestamp: string;
}

interface ThinkingEvent {
  type: 'thinking';
  ticker: string;
  message: string;
  timestamp: string;
}

interface ToolResultEvent {
  type: 'tool_result';
  ticker: string;
  toolId: string;
  toolName?: string;
  toolInput?: any;
  timestamp: string;
}

interface PDFEvent {
  type: 'pdf';
  ticker: string;
  pdfBase64: string;
  fileSize: number;
  reportType: 'full' | 'summary';
  timestamp: string;
}

interface CompleteEvent {
  type: 'complete';
  ticker: string;
  fullAnalysis?: string;
  executiveSummary?: string;
  metadata: {
    analysisDate: string;
    framework: string;
    model: string;
    duration: number;
  };
}

interface ErrorEvent {
  type: 'error';
  message: string;
  timestamp: string;
}

interface ConnectedEvent {
  type: 'connected';
  streamId: string;
  ticker: string;
}

type StreamEvent = ChunkEvent | ToolEvent | ThinkingEvent | ToolResultEvent | PDFEvent | CompleteEvent | ErrorEvent | ConnectedEvent;

@Injectable()
export class StreamManagerService {
  private readonly logger = new Logger(StreamManagerService.name);
  private activeStreams = new Map<string, EventSource>();
  private streamBuffers = new Map<string, string>();
  private streamStartTimes = new Map<string, number>();
  private lastInterventionTimes = new Map<string, number>();
  private activeSessions = new Map<string, SessionInfo>();

  async startStream(config: StreamConfig): Promise<void> {
    const { chatId, ticker, ctx, messageId, agentUrl } = config;

    // Connect to Agent's SSE endpoint
    const streamUrl = `${agentUrl}/api/analyze/${ticker}/stream`;
    const params = new URLSearchParams({
      userId: ctx.from?.id.toString() || 'anonymous',
      sessionId: `telegram-${chatId}`,
      platform: 'telegram',
      prompt: `Analyze ${ticker} using Framework ${FRAMEWORK_VERSION}`,
    });

    const eventSource = new EventSource(`${streamUrl}?${params}`);
    this.activeStreams.set(chatId, eventSource);
    this.streamBuffers.set(chatId, '');
    this.streamStartTimes.set(chatId, Date.now());
    this.lastInterventionTimes.set(chatId, Date.now());

    // Track session
    this.activeSessions.set(chatId, {
      ticker,
      status: 'analyzing',
      startedAt: new Date().toISOString(),
    });

    let currentMessageId = messageId;
    let lastUpdateTime = Date.now();
    let updateCounter = 0;
    let hasReceivedContent = false;

    // Time-based intervention messages
    const interventionTimer = setInterval(async () => {
      if (!this.activeStreams.has(chatId)) {
        clearInterval(interventionTimer);
        return;
      }

      const elapsed = Date.now() - this.streamStartTimes.get(chatId)!;
      const timeSinceLastIntervention = Date.now() - this.lastInterventionTimes.get(chatId)!;

      // Only send interventions if no recent updates
      if (timeSinceLastIntervention < TimeConstants.INTERVENTION_MIN_GAP) return;

      try {
        if (elapsed > TimeConstants.INTERVENTION_90S) {
          await ctx.sendChatAction('typing');
          await ctx.reply('Taking a bit longer than usual, but quality analysis takes time! 🔬');
          this.lastInterventionTimes.set(chatId, Date.now());
        } else if (elapsed > TimeConstants.INTERVENTION_60S) {
          await ctx.sendChatAction('typing');
          await ctx.reply('Almost there... Generating your report 📄');
          this.lastInterventionTimes.set(chatId, Date.now());
        } else if (elapsed > TimeConstants.INTERVENTION_30S) {
          await ctx.sendChatAction('typing');
          await ctx.reply('Still analyzing... This is thorough analysis, hang tight! ⏳');
          this.lastInterventionTimes.set(chatId, Date.now());
        }
      } catch {
        // Ignore typing action failures
      }
    }, TimeConstants.INTERVENTION_CHECK_INTERVAL);

    eventSource.onmessage = async (event: MessageEvent) => {
      try {
        this.logger.log(`[SSE] Received event: ${event.data.substring(0, 200)}`);
        const data: StreamEvent = JSON.parse(event.data);
        this.logger.log(`[SSE] Parsed event type: ${data.type}`);
        this.lastInterventionTimes.set(chatId, Date.now()); // Reset intervention timer on any event

        switch (data.type) {
          case StreamEventType.CONNECTED:
            this.logger.log(`Stream connected for ${ticker}: ${data.streamId}`);
            break;

          case StreamEventType.CHUNK: {
            this.logger.log(`[CHUNK] Received chunk: ${data.content.length} chars`);
            hasReceivedContent = true;
            // Append LLM output to buffer
            const buffer = this.streamBuffers.get(chatId) || '';
            const updatedBuffer = buffer + data.content;
            this.streamBuffers.set(chatId, updatedBuffer);
            this.logger.log(`[CHUNK] Buffer size: ${updatedBuffer.length} chars`);
            updateCounter++;

            // Update more frequently using TimeConstants
            const shouldUpdate =
              Date.now() - lastUpdateTime > TimeConstants.STREAM_UPDATE_INTERVAL ||
              updateCounter >= TimeConstants.STREAM_CHUNK_THRESHOLD;

            if (shouldUpdate) {
              updateCounter = 0;
              lastUpdateTime = Date.now();

              // Preserve the initial "Analyzing X..." message and append LLM content below it
              const displayText = `Analyzing ${ticker}...\n\n${updatedBuffer}`;
              this.logger.log(`[CHUNK] Updating Telegram message: ${displayText.length} chars, messageId: ${currentMessageId}`);

              try {
                // Smart message strategy: append to existing message up to Telegram limit
                if (displayText.length <= TelegramLimits.SAFE_MESSAGE_LENGTH) {
                  this.logger.log(`[CHUNK] Editing existing message`);
                  await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    currentMessageId,
                    undefined,
                    displayText
                  );
                  this.logger.log(`[CHUNK] Message edited successfully`);
                } else {
                  this.logger.log(`[CHUNK] Creating new message (overflow)`);

                  // Send new message when overflow (without the header since we're continuing)
                  const newMsg = await ctx.reply(updatedBuffer.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
                  currentMessageId = newMsg.message_id;
                  this.streamBuffers.set(chatId, updatedBuffer.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
                }
              } catch (error) {
                const err = error as Error;
                if (err.message?.includes('message is not modified')) {
                  // Content unchanged, skip
                } else if (err.message?.includes('too many requests')) {
                  this.logger.debug('Rate limited, skipping update');
                } else {
                  // Send new message if edit fails
                  try {
                    const newMsg = await ctx.reply(displayText.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
                    currentMessageId = newMsg.message_id;
                  } catch {
                    // Ignore if send also fails
                  }
                }
              }
            }
            break;
          }

          case StreamEventType.TOOL: {
            // Rich tool call display with arguments
            const toolMessage = this.formatToolCall(data);

            try {
              await ctx.reply(toolMessage);
            } catch (error) {
              this.logger.error('Failed to send tool message:', error);
            }

            // Also show typing indicator
            try {
              await ctx.sendChatAction('typing');
            } catch {
              // Ignore if typing action fails
            }
            break;
          }

          case StreamEventType.THINKING:
            // Show typing indicator for thinking blocks
            try {
              await ctx.sendChatAction('typing');
            } catch {
              // Ignore if typing action fails
            }
            break;

          case StreamEventType.TOOL_RESULT: {
            // Show tool completion with inputs
            const resultMessage = this.formatToolResult(data);
            try {
              await ctx.reply(resultMessage);
            } catch (error) {
              this.logger.error('Failed to send tool result message:', error);
            }
            break;
          }

          case StreamEventType.PDF: {
            // Receive PDF and send as document
            this.logger.log(`Received PDF for ${ticker}: ${data.fileSize} bytes, type: ${data.reportType}`);
            try {
              const pdfBuffer = Buffer.from(data.pdfBase64, 'base64');
              const filename = `${ticker}_${data.reportType}_analysis.pdf`;

              await ctx.telegram.sendDocument(
                ctx.chat!.id,
                {
                  source: pdfBuffer,
                  filename: filename,
                },
                {
                  caption: `📄 ${ticker} ${data.reportType === 'full' ? 'Full Analysis' : 'Executive Summary'} Report\n` +
                           `File size: ${Math.round(data.fileSize / 1024)}KB`,
                }
              );

              this.logger.log(`PDF sent successfully for ${ticker}`);
            } catch (error) {
              this.logger.error(`Failed to send PDF for ${ticker}:`, error);
              await ctx.reply(`⚠️ PDF generated but failed to send. Size: ${Math.round(data.fileSize / 1024)}KB`);
            }
            break;
          }

          case StreamEventType.COMPLETE: {
            clearInterval(interventionTimer);

            const duration = Math.round(data.metadata.duration / 1000);

            // Mark session as complete but don't remove it (allow conversations)
            const session = this.activeSessions.get(chatId);
            if (session) {
              session.status = 'completed';
            }

            // Only send completion metadata if we have content
            if (hasReceivedContent) {
              await ctx.reply(
                `✅ Analysis complete!\n\n` +
                `⏱️ Duration: ${duration}s\n` +
                `🤖 Model: ${data.metadata.model}\n` +
                `📊 Framework: ${data.metadata.framework}\n\n` +
                `💬 You can now ask follow-up questions!`
              );
            }

            this.cleanup(chatId);
            break;
          }

          case StreamEventType.ERROR:
            clearInterval(interventionTimer);
            await ctx.reply(`❌ Error: ${data.message}`);
            this.cleanup(chatId);
            break;
        }
      } catch (error) {
        this.logger.error('Stream processing error:', error);
      }
    };

    eventSource.onerror = async (error: any) => {
      this.logger.error('SSE error:', error);
      clearInterval(interventionTimer);
      if (eventSource.readyState === EventSource.CLOSED) {
        await ctx.reply('❌ Connection lost. Please try again if needed.');
        this.cleanup(chatId);
      }
    };

    // Timeout after configured duration
    setTimeout(() => {
      if (this.activeStreams.has(chatId)) {
        clearInterval(interventionTimer);
        ctx.reply('⏱️ Analysis timeout. Please try again if needed.');
        this.cleanup(chatId);
      }
    }, TimeConstants.STREAM_TIMEOUT);
  }

  hasActiveStream(chatId: string): boolean {
    return this.activeStreams.has(chatId);
  }

  stopStream(chatId: string): boolean {
    if (this.hasActiveStream(chatId)) {
      this.cleanup(chatId);
      return true;
    }
    return false;
  }

  private cleanup(chatId: string): void {
    const stream = this.activeStreams.get(chatId);
    if (stream) {
      stream.close();
      this.activeStreams.delete(chatId);
    }
    this.streamBuffers.delete(chatId);
    this.streamStartTimes.delete(chatId);
    this.lastInterventionTimes.delete(chatId);
    // Note: Don't delete session - keep it for conversation mode
  }

  /**
   * Start conversation mode - send follow-up question to active session
   */
  async startConversation(config: ConversationConfig): Promise<void> {
    const { chatId, message, ctx, messageId, agentUrl } = config;

    // Connect to Agent's conversation endpoint
    const conversationUrl = `${agentUrl}/api/conversation/${chatId}/stream`;
    const params = new URLSearchParams({
      message,
      userId: ctx.from?.id.toString() || 'anonymous',
      platform: 'telegram',
    });

    const eventSource = new EventSource(`${conversationUrl}?${params}`);
    this.activeStreams.set(chatId, eventSource);
    this.streamBuffers.set(chatId, '');
    this.lastInterventionTimes.set(chatId, Date.now());

    let currentMessageId = messageId;
    let lastUpdateTime = Date.now();
    let updateCounter = 0;

    eventSource.onmessage = async (event: MessageEvent) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        this.lastInterventionTimes.set(chatId, Date.now());

        switch (data.type) {
          case StreamEventType.CHUNK: {
            // Append response to buffer
            const buffer = this.streamBuffers.get(chatId) || '';
            const updatedBuffer = buffer + data.content;
            this.streamBuffers.set(chatId, updatedBuffer);
            updateCounter++;

            const shouldUpdate =
              Date.now() - lastUpdateTime > TimeConstants.STREAM_UPDATE_INTERVAL ||
              updateCounter >= TimeConstants.STREAM_CHUNK_THRESHOLD;

            if (shouldUpdate) {
              updateCounter = 0;
              lastUpdateTime = Date.now();

              try {
                if (updatedBuffer.length <= TelegramLimits.SAFE_MESSAGE_LENGTH) {
                  await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    currentMessageId,
                    undefined,
                    updatedBuffer
                  );
                } else {
                  const newMsg = await ctx.reply(updatedBuffer.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
                  currentMessageId = newMsg.message_id;
                  this.streamBuffers.set(chatId, updatedBuffer.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
                }
              } catch (error) {
                // Handle edit failures
                const err = error as Error;
                if (!err.message?.includes('message is not modified') && !err.message?.includes('too many requests')) {
                  try {
                    const newMsg = await ctx.reply(updatedBuffer.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
                    currentMessageId = newMsg.message_id;
                  } catch {
                    // Ignore
                  }
                }
              }
            }
            break;
          }

          case StreamEventType.THINKING:
            try {
              await ctx.sendChatAction('typing');
            } catch {
              // Ignore
            }
            break;

          case StreamEventType.COMPLETE:
            await ctx.reply('✅ Response complete!');
            this.cleanup(chatId);
            break;

          case StreamEventType.ERROR:
            await ctx.reply(`❌ Error: ${data.message}`);
            this.cleanup(chatId);
            break;
        }
      } catch (error) {
        this.logger.error('Conversation stream processing error:', error);
      }
    };

    eventSource.onerror = async (error: any) => {
      this.logger.error('Conversation SSE error:', error);
      if (eventSource.readyState === EventSource.CLOSED) {
        await ctx.reply('❌ Connection lost.');
        this.cleanup(chatId);
      }
    };
  }

  /**
   * Check if there's an active session (even if stream is closed)
   */
  hasActiveSession(chatId: string): boolean {
    return this.activeSessions.has(chatId);
  }

  /**
   * Get session status information
   */
  getSessionStatus(chatId: string): SessionInfo | null {
    return this.activeSessions.get(chatId) || null;
  }

  private formatToolCall(data: ToolEvent): string {
    // Remove MCP prefix for cleaner display
    const cleanToolName = data.toolName
      .replace('mcp__stock-analyzer__', '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Parse tool input for rich context
    const input = data.toolInput || {};

    if (isToolName(data.toolName, ToolName.FETCH_COMPANY_DATA)) {
      return this.formatFetchCompanyData(input, data.ticker);
    } else if (isToolName(data.toolName, ToolName.CALCULATE_DCF)) {
      return this.formatCalculateDCF(input, data.ticker);
    } else if (isToolName(data.toolName, ToolName.GENERATE_PDF)) {
      return this.formatGeneratePDF(input, data.ticker);
    } else {
      return `🔧 ${cleanToolName}...`;
    }
  }

  private formatFetchCompanyData(input: any, ticker: string): string {
    const dataTypes = input.dataTypes || [];
    const period = input.period || PeriodType.QUARTERLY;
    const limit = input.limit || 4;

    let message = `📊 Fetching ${ticker} financial data...\n`;

    if (dataTypes.length > 0) {
      const typeLabels = dataTypes.map((type: string) => {
        return FinancialDataTypeLabel[type as FinancialDataType] || type;
      });
      message += `• Data: ${typeLabels.join(', ')}\n`;
    }

    message += `• Period: ${period === PeriodType.QUARTERLY ? 'Last ' + limit + ' quarters' : 'Last ' + limit + ' years'}`;

    return message;
  }

  private formatCalculateDCF(input: any, ticker: string): string {
    const projectionYears = input.projectionYears || 5;
    const discountRate = input.discountRate || 0.10;

    return `🧮 Running DCF valuation...\n` +
           `• Ticker: ${ticker}\n` +
           `• Projection: ${projectionYears} years\n` +
           `• Discount rate: ${(discountRate * 100).toFixed(1)}%`;
  }

  private formatGeneratePDF(input: any, ticker: string): string {
    const reportType = input.reportType || ReportType.SUMMARY;
    const label = ReportTypeLabel[reportType as ReportType] || reportType;

    return `📄 Generating ${label} PDF report for ${ticker}...`;
  }

  private formatToolResult(data: ToolResultEvent): string {
    if (!data.toolName) {
      return '✅ Tool completed successfully';
    }

    const input = data.toolInput || {};
    this.logger.log(`[TOOL_RESULT] Formatting result for ${data.toolName}, input: ${JSON.stringify(input)}`);

    if (isToolName(data.toolName, ToolName.FETCH_COMPANY_DATA)) {
      const dataTypes = input.dataTypes || [];
      const period = input.period || PeriodType.QUARTERLY;
      const limit = input.limit || 4;

      this.logger.log(`[TOOL_RESULT] dataTypes: ${JSON.stringify(dataTypes)}, period: ${period}, limit: ${limit}`);

      let message = `✅ Financial data retrieved successfully!\n\n`;

      if (dataTypes.length > 0) {
        const typeLabels = dataTypes.map((type: string) => {
          return FinancialDataTypeLabel[type as FinancialDataType] || type;
        });
        message += `📊 Data fetched:\n`;
        typeLabels.forEach((label: string) => {
          message += `  • ${label}\n`;
        });
      }

      message += `\n⏱️ Period: ${period === PeriodType.QUARTERLY ? 'Last ' + limit + ' quarters' : 'Last ' + limit + ' years'}\n\n`;
      message += `⏰ Analysis may take 1-2 minutes. Please wait...`;

      return message;
    } else if (isToolName(data.toolName, ToolName.CALCULATE_DCF)) {
      const projectionYears = input.projectionYears || 5;
      const discountRate = input.discountRate || 0.10;

      return `✅ DCF valuation completed!\n\n` +
             `📈 Parameters:\n` +
             `  • Projection: ${projectionYears} years\n` +
             `  • Discount rate: ${(discountRate * 100).toFixed(1)}%`;
    } else if (isToolName(data.toolName, ToolName.GENERATE_PDF)) {
      const reportType = input.reportType || ReportType.SUMMARY;
      const label = ReportTypeLabel[reportType as ReportType] || reportType;

      return `✅ ${label} PDF generated successfully!`;
    } else {
      return '✅ Tool completed successfully';
    }
  }
}
