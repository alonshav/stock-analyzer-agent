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
  FRAMEWORK_VERSION,
  StreamEventPayload,
  ToolEvent,
  ToolResultEvent,
} from '@stock-analyzer/shared/types';

// Local interfaces for configuration only (event types now imported from shared/types)
interface StreamConfig {
  chatId: string;
  ticker: string;
  ctx: Context;
  agentUrl: string;
}

interface ConversationConfig {
  chatId: string;
  message: string;
  ctx: Context;
  agentUrl: string;
}

interface SessionInfo {
  ticker: string;
  status: string;
  startedAt: string;
}

@Injectable()
export class StreamManagerService {
  private readonly logger = new Logger(StreamManagerService.name);
  private activeStreams = new Map<string, EventSource>();
  private activeSessions = new Map<string, SessionInfo>();

  async startStream(config: StreamConfig): Promise<void> {
    const { chatId, ticker, ctx, agentUrl } = config;

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

    // Track session
    this.activeSessions.set(chatId, {
      ticker,
      status: 'analyzing',
      startedAt: new Date().toISOString(),
    });

    eventSource.onmessage = async (event: MessageEvent) => {
      try {
        const data: StreamEventPayload = JSON.parse(event.data);
        this.logger.log(`[${ticker}] Received event: ${data.type}`);

        switch (data.type) {
          case StreamEventType.CONNECTED:
            this.logger.log(`Stream connected for ${ticker}: ${data.streamId}`);
            break;

          case StreamEventType.CHUNK: {
            // Send new message for each chunk
            this.logger.log(`[${ticker}] CHUNK event - content length: ${data.content?.length || 0}`);
            if (data.content) {
              try {
                this.logger.log(`[${ticker}] ===== CHUNK CONTENT START =====`);
                this.logger.log(data.content);
                this.logger.log(`[${ticker}] ===== CHUNK CONTENT END =====`);
                this.logger.log(`[${ticker}] Calling sendLongMessage with content: "${data.content.substring(0, 50)}..."`);
                await this.sendLongMessage(ctx, data.content, true);
                this.logger.log(`[${ticker}] Successfully sent chunk`);
              } catch (error) {
                this.logger.error(`[${ticker}] Error sending chunk:`, error);
              }
            }
            break;
          }

          case StreamEventType.PARTIAL: {
            // Send new message for partial content
            if (data.partialContent) {
              await this.sendLongMessage(ctx, data.partialContent, true);
            }
            break;
          }

          case StreamEventType.TOOL: {
            // Send tool notification
            const toolMessage = this.formatToolCall(data);
            try {
              await ctx.reply(toolMessage);
              await ctx.sendChatAction('typing');
            } catch (error) {
              this.logger.error('Failed to send tool message:', error);
            }
            break;
          }

          case StreamEventType.THINKING:
            try {
              await ctx.reply('💭 Thinking...');
              await ctx.sendChatAction('typing');
            } catch (error) {
              this.logger.error('Failed to send thinking message:', error);
            }
            break;

          case StreamEventType.TOOL_RESULT: {
            const resultMessage = this.formatToolResult(data);
            try {
              await ctx.reply(resultMessage);
            } catch (error) {
              this.logger.error('Failed to send tool result message:', error);
            }
            break;
          }

          case StreamEventType.PDF: {
            this.logger.log(`Received PDF for ${ticker}: ${data.fileSize} bytes`);

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

          case StreamEventType.RESULT:
            this.logger.log(`[RESULT] tokens=${data.totalTokens}, cost=${data.cost}`);
            break;

          case StreamEventType.SYSTEM:
            this.logger.log(`[SYSTEM] model=${data.model}`);
            break;

          case StreamEventType.COMPACTION:
            this.logger.log(`[COMPACTION] ${data.messagesBefore} → ${data.messagesAfter} messages`);
            break;

          case StreamEventType.COMPLETE: {
            const duration = Math.round(data.metadata.duration / 1000);

            // Mark session as complete
            const session = this.activeSessions.get(chatId);
            if (session) {
              session.status = 'completed';
            }

            // Send completion message
            await ctx.reply(
              `✅ Analysis complete!\n\n` +
              `⏱️ Duration: ${duration}s\n` +
              `🤖 Model: ${data.metadata.model}\n` +
              `📊 Framework: ${data.metadata.framework}\n\n` +
              `💬 You can now ask follow-up questions!`
            );

            this.cleanup(chatId);
            break;
          }

          case StreamEventType.ERROR:
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

      if (eventSource.readyState === EventSource.CLOSED) {
        const session = this.activeSessions.get(chatId);

        if (session?.status !== 'completed') {
          await ctx.reply('❌ Connection lost. Please try again.');
        }

        this.cleanup(chatId);
      }
    };
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
    // Note: Don't delete session - keep it for conversation mode
  }

  /**
   * Start conversation mode - send follow-up question to active session
   */
  async startConversation(config: ConversationConfig): Promise<void> {
    const { chatId, message, ctx, agentUrl } = config;

    // Connect to Agent's conversation endpoint
    const conversationUrl = `${agentUrl}/api/analyze/conversation/${chatId}/stream`;
    const params = new URLSearchParams({
      message,
      userId: ctx.from?.id.toString() || 'anonymous',
      platform: 'telegram',
    });

    const eventSource = new EventSource(`${conversationUrl}?${params}`);
    this.activeStreams.set(chatId, eventSource);

    eventSource.onmessage = async (event: MessageEvent) => {
      try {
        const data: StreamEventPayload = JSON.parse(event.data);

        switch (data.type) {
          case StreamEventType.CHUNK: {
            // Send new message for each chunk
            if (data.content) {
              await this.sendLongMessage(ctx, data.content, true);
            }
            break;
          }

          case StreamEventType.PARTIAL: {
            // Send new message for partial content
            if (data.partialContent) {
              await this.sendLongMessage(ctx, data.partialContent, true);
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

          case StreamEventType.RESULT:
          case StreamEventType.SYSTEM:
          case StreamEventType.COMPACTION:
            this.logger.log(`[${data.type.toUpperCase()}] Event received in conversation mode`);
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

  /**
   * Send long messages by splitting them if they exceed Telegram's 4096 character limit
   * @param ctx Telegraf context
   * @param content Original content
   * @param useMarkdown Whether to use MarkdownV2 formatting
   */
  private async sendLongMessage(ctx: Context, content: string, useMarkdown = true): Promise<void> {
    const MAX_LENGTH = 4000; // Leave some margin below 4096 limit
    this.logger.debug(`sendLongMessage called - content length: ${content.length}, useMarkdown: ${useMarkdown}`);

    try {
      if (useMarkdown) {
        this.logger.debug('Escaping markdown...');
        const escaped = this.escapeMarkdownV2(content);
        this.logger.debug(`Escaped length: ${escaped.length}`);
        this.logger.log(`===== ESCAPED CONTENT START =====`);
        this.logger.log(escaped);
        this.logger.log(`===== ESCAPED CONTENT END =====`);

        // Check if message fits in one message
        if (escaped.length <= MAX_LENGTH) {
          this.logger.debug('Sending as single message with MarkdownV2');
          await ctx.replyWithMarkdownV2(escaped);
          this.logger.debug('Successfully sent single message');
          return;
        }

        // Split into chunks at newline boundaries to preserve formatting
        const chunks = this.splitIntoChunks(escaped, MAX_LENGTH);
        this.logger.log(`Splitting long message into ${chunks.length} chunks`);

        for (let i = 0; i < chunks.length; i++) {
          this.logger.debug(`Sending chunk ${i + 1}/${chunks.length}`);
          await ctx.replyWithMarkdownV2(chunks[i]);
          this.logger.debug(`Chunk ${i + 1} sent successfully`);
        }
      } else {
        // Plain text fallback
        if (content.length <= MAX_LENGTH) {
          await ctx.reply(content);
          return;
        }

        const chunks = this.splitIntoChunks(content, MAX_LENGTH);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      }
    } catch (error) {
      this.logger.error('Failed to send message with MarkdownV2, falling back to plain text:', error);
      // Final fallback: send as plain text
      if (content.length <= MAX_LENGTH) {
        await ctx.reply(content);
      } else {
        const chunks = this.splitIntoChunks(content, MAX_LENGTH);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      }
    }
  }

  /**
   * Split text into chunks at newline boundaries
   */
  private splitIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      // If adding this line would exceed max length, save current chunk and start new one
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        // If single line is too long, split it forcefully
        if (line.length > maxLength) {
          let remaining = line;
          while (remaining.length > maxLength) {
            chunks.push(remaining.substring(0, maxLength));
            remaining = remaining.substring(maxLength);
          }
          currentChunk = remaining;
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Convert Claude's Markdown to Telegram MarkdownV2
   * Claude uses: ## headings, **bold**, *italic*, [text](url)
   * MarkdownV2 uses: *bold* _italic_ [text](url) with escaped special chars
   * Note: MarkdownV2 doesn't support headings, so we convert them to bold
   */
  private escapeMarkdownV2(text: string): string {
    // Step 1: Convert headings to bold, stripping any nested markdown first
    text = text.replace(/^#{1,6}\s+(.+?)$/gm, (_match, content) => {
      // Strip **bold** and *italic* from heading content
      const stripped = content.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
      return `XBOLDX${stripped}XBOLDENDX`;
    });

    // Step 2: Convert Claude's **bold** to placeholder
    text = text.replace(/\*\*(.+?)\*\*/g, 'XBOLDX$1XBOLDENDX');

    // Step 3: Convert Claude's *italic* to placeholder (after bold conversion)
    text = text.replace(/\*(.+?)\*/g, 'XITALICX$1XITALICENDX');

    // Step 4: Preserve links [text](url)
    text = text.replace(/\[(.+?)\]\((.+?)\)/g, 'XLINKX$1XURLX$2XLINKENDX');

    // Step 5: Escape all special MarkdownV2 characters
    // Characters that need escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
    text = text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');

    // Step 6: Convert placeholders back to MarkdownV2 syntax
    text = text.replace(/XBOLDX/g, '*');
    text = text.replace(/XBOLDENDX/g, '*');
    text = text.replace(/XITALICX/g, '_');
    text = text.replace(/XITALICENDX/g, '_');
    text = text.replace(/XLINKX/g, '[');
    text = text.replace(/XURLX/g, '](');
    text = text.replace(/XLINKENDX/g, ')');

    return text;
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
