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

type StreamEvent = ChunkEvent | ToolEvent | ThinkingEvent | PDFEvent | CompleteEvent | ErrorEvent | ConnectedEvent;

@Injectable()
export class StreamManagerService {
  private readonly logger = new Logger(StreamManagerService.name);
  private activeStreams = new Map<string, EventSource>();
  private streamBuffers = new Map<string, string>();
  private streamStartTimes = new Map<string, number>();
  private lastInterventionTimes = new Map<string, number>();

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
        const data: StreamEvent = JSON.parse(event.data);
        this.lastInterventionTimes.set(chatId, Date.now()); // Reset intervention timer on any event

        switch (data.type) {
          case StreamEventType.CONNECTED:
            this.logger.log(`Stream connected for ${ticker}: ${data.streamId}`);
            break;

          case StreamEventType.CHUNK:
            hasReceivedContent = true;
            // Append LLM output to buffer
            const buffer = this.streamBuffers.get(chatId) || '';
            const updatedBuffer = buffer + data.content;
            this.streamBuffers.set(chatId, updatedBuffer);
            updateCounter++;

            // Update more frequently using TimeConstants
            const shouldUpdate =
              Date.now() - lastUpdateTime > TimeConstants.STREAM_UPDATE_INTERVAL ||
              updateCounter >= TimeConstants.STREAM_CHUNK_THRESHOLD;

            if (shouldUpdate) {
              updateCounter = 0;
              lastUpdateTime = Date.now();

              const displayText = updatedBuffer;

              try {
                // Smart message strategy: append to existing message up to Telegram limit
                if (displayText.length <= TelegramLimits.SAFE_MESSAGE_LENGTH) {
                  await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    currentMessageId,
                    undefined,
                    displayText
                  );
                } else {
                  // Send new message when overflow
                  const newMsg = await ctx.reply(displayText.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
                  currentMessageId = newMsg.message_id;
                  this.streamBuffers.set(chatId, displayText.slice(-TelegramLimits.TRUNCATED_MESSAGE_LENGTH));
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

          case StreamEventType.TOOL:
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

          case StreamEventType.THINKING:
            // Show typing indicator for thinking blocks
            try {
              await ctx.sendChatAction('typing');
            } catch {
              // Ignore if typing action fails
            }
            break;

          case StreamEventType.PDF:
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

          case StreamEventType.COMPLETE:
            clearInterval(interventionTimer);

            const duration = Math.round(data.metadata.duration / 1000);

            // Only send completion metadata if we have content
            if (hasReceivedContent) {
              await ctx.reply(
                `✅ Analysis complete!\n\n` +
                `⏱️ Duration: ${duration}s\n` +
                `🤖 Model: ${data.metadata.model}\n` +
                `📊 Framework: ${data.metadata.framework}`
              );
            }

            this.cleanup(chatId);
            break;

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
  }

  private formatToolCall(data: ToolEvent): string {
    // Remove MCP prefix for cleaner display
    let cleanToolName = data.toolName
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
}
