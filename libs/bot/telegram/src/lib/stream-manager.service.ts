import { Injectable, Logger } from '@nestjs/common';
import { EventSource } from 'eventsource';
import { Context } from 'telegraf';

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
  private toolCallsCount = new Map<string, number>();

  async startStream(config: StreamConfig): Promise<void> {
    const { chatId, ticker, ctx, messageId, agentUrl } = config;

    // Connect to Agent's SSE endpoint
    const streamUrl = `${agentUrl}/api/analyze/${ticker}/stream`;
    const params = new URLSearchParams({
      userId: ctx.from?.id.toString() || 'anonymous',
      sessionId: `telegram-${chatId}`,
      platform: 'telegram',
      prompt: `Analyze ${ticker} using Framework v2.3`,
    });

    const eventSource = new EventSource(`${streamUrl}?${params}`);
    this.activeStreams.set(chatId, eventSource);
    this.streamBuffers.set(chatId, '');
    this.toolCallsCount.set(chatId, 0);

    let currentMessageId = messageId;
    let lastUpdateTime = Date.now();
    let updateCounter = 0;

    eventSource.onmessage = async (event: MessageEvent) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            this.logger.log(`Stream connected for ${ticker}: ${data.streamId}`);
            break;

          case 'chunk':
            // Append LLM output to buffer
            const buffer = this.streamBuffers.get(chatId) || '';
            const updatedBuffer = buffer + data.content;
            this.streamBuffers.set(chatId, updatedBuffer);
            updateCounter++;

            // Update message every second or every 10 chunks
            const shouldUpdate =
              Date.now() - lastUpdateTime > 1000 ||
              updateCounter >= 10;

            if (shouldUpdate) {
              updateCounter = 0;
              lastUpdateTime = Date.now();

              // Telegram message limit is 4096 chars
              const displayText = this.formatBuffer(updatedBuffer, ticker);

              try {
                await ctx.telegram.editMessageText(
                  ctx.chat!.id,
                  currentMessageId,
                  undefined,
                  displayText
                );
              } catch (error) {
                const err = error as Error;
                // Handle edit failures
                if (err.message?.includes('message is not modified')) {
                  // Content unchanged, skip
                } else if (err.message?.includes('too many requests')) {
                  // Rate limited
                  this.logger.debug('Rate limited, skipping update');
                } else {
                  // Send new message if edit fails
                  const newMsg = await ctx.reply(
                    '📊 Continuing analysis...\n\n' + displayText.slice(-3000)
                  );
                  currentMessageId = newMsg.message_id;
                }
              }
            }
            break;

          case 'tool':
            // Display tool usage to user
            const toolCount = (this.toolCallsCount.get(chatId) || 0) + 1;
            this.toolCallsCount.set(chatId, toolCount);

            const toolMessage = `📊 Using tool: ${data.toolName}`;
            this.logger.log(`Tool called: ${data.toolName} (${data.toolId})`);

            // Add tool notification to buffer
            const currentBuffer = this.streamBuffers.get(chatId) || '';
            this.streamBuffers.set(chatId, currentBuffer + `\n\n${toolMessage}\n`);

            try {
              await ctx.telegram.editMessageText(
                ctx.chat!.id,
                currentMessageId,
                undefined,
                this.formatBuffer(this.streamBuffers.get(chatId) || '', ticker)
              );
            } catch {
              // Ignore edit failures for tool messages
            }
            break;

          case 'thinking':
            // Show thinking indicator
            this.logger.log(`Agent is thinking for ${ticker}`);
            try {
              await ctx.sendChatAction('typing');
            } catch {
              // Ignore if typing action fails
            }
            break;

          case 'pdf':
            // Receive PDF and send as document
            this.logger.log(`Received PDF for ${ticker}: ${data.fileSize} bytes, type: ${data.reportType}`);
            try {
              // Decode base64 to buffer
              const pdfBuffer = Buffer.from(data.pdfBase64, 'base64');

              // Send as document
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

          case 'complete':
            // Final update with executive summary
            const finalBuffer = this.streamBuffers.get(chatId) || '';
            const summary = data.executiveSummary;
            const duration = Math.round(data.metadata.duration / 1000); // Convert to seconds

            // Update with complete analysis
            const completeText = this.formatCompleteAnalysis(
              summary,
              ticker,
              duration,
              data.metadata.model
            );

            try {
              await ctx.telegram.editMessageText(
                ctx.chat!.id,
                currentMessageId,
                undefined,
                completeText,
                { parse_mode: 'Markdown' }
              );
            } catch {
              await ctx.reply(completeText, { parse_mode: 'Markdown' });
            }

            // Send completion message
            await ctx.reply(
              `✅ Analysis complete for ${ticker}!\n\n` +
              `⏱️ Duration: ${duration}s\n` +
              `🤖 Model: ${data.metadata.model}\n` +
              `📊 Framework: ${data.metadata.framework}`,
              { parse_mode: 'Markdown' }
            );

            this.cleanup(chatId);
            break;

          case 'error':
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
        await ctx.reply('❌ Connection lost. Please try again if needed.');
        this.cleanup(chatId);
      }
    };

    // Timeout after 5 minutes
    setTimeout(() => {
      if (this.activeStreams.has(chatId)) {
        ctx.reply('⏱️ Analysis timeout. Please try again if needed.');
        this.cleanup(chatId);
      }
    }, 300000);
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
    this.toolCallsCount.delete(chatId);
  }

  private formatBuffer(buffer: string, ticker: string): string {
    if (buffer.length > 3500) {
      return `🔄 Analysis for ${ticker} (truncated)...\n\n` +
             '...' + buffer.slice(-3500);
    }
    return `🔄 Analysis for ${ticker}...\n\n${buffer}`;
  }

  private formatCompleteAnalysis(
    summary: string,
    ticker: string,
    duration: number,
    model: string
  ): string {
    // Truncate if needed for Telegram's 4096 char limit
    let formattedSummary = summary;
    if (summary.length > 3800) {
      formattedSummary = summary.slice(0, 3800) + '...\n\n[Summary truncated]';
    }

    return (
      `✅ *Analysis Complete: ${ticker}*\n\n` +
      `${formattedSummary}\n\n` +
      `⏱️ Duration: ${duration}s | 🤖 ${model}`
    );
  }
}
