import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { StreamManagerService } from './stream-manager.service';
import { SessionOrchestrator } from '@stock-analyzer/bot/sessions';
import { WorkflowType } from '@stock-analyzer/shared/types';

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly agentUrl: string;
  private readonly webhookEnabled: boolean;

  constructor(
    private configService: ConfigService,
    private streamManager: StreamManagerService,
    private sessionOrchestrator: SessionOrchestrator
  ) {
    const token = this.configService.get<string>('telegram.botToken');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    this.bot = new Telegraf(token);
    this.agentUrl =
      this.configService.get<string>('telegram.agentUrl') ||
      'http://localhost:3001';
    this.webhookEnabled =
      this.configService.get<boolean>('telegram.webhookEnabled') || false;
  }

  getBot(): Telegraf {
    return this.bot;
  }

  async onApplicationBootstrap() {
    await this.setupBot();

    if (!this.webhookEnabled) {
      this.logger.log('Starting bot in polling mode...');
      this.bot.launch().catch((error) => {
        this.logger.error('❌ Failed to start bot:', error);
      });
      this.logger.log('✅ Bot launched in polling mode');
    } else {
      await this.setupWebhook();
    }
  }

  async handleUpdate(update: unknown): Promise<void> {
    await this.bot.handleUpdate(update as any);
  }

  private async setupBot() {
    // Command handlers
    this.bot.command('start', this.handleStartCommand.bind(this));
    this.bot.command('analyze', this.handleAnalyzeCommand.bind(this));
    this.bot.command('stop', this.handleStopCommand.bind(this));
    this.bot.command('status', this.handleStatusCommand.bind(this));
    this.bot.command('help', this.handleHelpCommand.bind(this));

    // Message handlers - route to conversation or analysis
    this.bot.on('text', this.handleTextMessage.bind(this));

    // Error handling
    this.bot.catch((err: unknown, ctx) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Bot error: ${errorMessage}`);
      ctx.reply('An error occurred. Please try again.').catch(() => {
        // Ignore reply failures
      });
    });
  }

  private async handleAnalyzeCommand(ctx: Context) {
    const message = ctx.message as any;
    const text = message?.text || '';
    const ticker = text.split(' ')[1]?.toUpperCase();
    const chatId = ctx.chat?.id.toString();

    if (!ticker) {
      await ctx.reply('Please provide a ticker symbol. Example: /analyze AAPL');
      return;
    }

    if (!chatId) {
      await ctx.reply('Unable to identify chat. Please try again.');
      return;
    }

    // Check if bot is currently responding
    if (this.streamManager.isResponding(chatId)) {
      await ctx.reply('⏳ Please wait for the current response to complete...');
      return;
    }

    try {
      await ctx.sendChatAction('typing');
      await ctx.reply(`📊 Starting analysis for ${ticker}...`);

      // Get or create session
      let session = this.sessionOrchestrator.getActiveSession(chatId) ||
                    this.sessionOrchestrator.getCompletedSession(chatId);

      if (!session) {
        session = this.sessionOrchestrator.createSession(chatId, ticker);
        this.logger.log(`Created session ${session.sessionId} for chat ${chatId}, ticker ${ticker}`);
      } else {
        // Update ticker if different
        this.logger.log(`Using existing session ${session.sessionId}, updating ticker to ${ticker}`);
        // Note: We'd need to add a method to update ticker if needed
      }

      // Mark as responding
      this.streamManager.startResponding(chatId);

      // Start streaming from Agent service
      await this.streamManager.startStream({
        chatId,
        ctx,
        agentUrl: this.agentUrl,
        workflowRequest: {
          sessionId: session.sessionId,
          workflowType: WorkflowType.FULL_ANALYSIS,
          params: {
            ticker,
            userPrompt: 'Perform a comprehensive stock analysis',
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to start analysis:', error);
      this.streamManager.stopResponding(chatId);
      await ctx.reply('Failed to start analysis. Please try again.');
    }
  }

  private async handleStopCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();

    if (!chatId) {
      await ctx.reply('Unable to identify chat. Please try again.');
      return;
    }

    // Check if bot is responding
    if (this.streamManager.isResponding(chatId)) {
      // Stop stream in StreamManager
      this.streamManager.stopStream(chatId);

      // Stop responding flag
      this.streamManager.stopResponding(chatId);

      // Stop session in SessionOrchestrator
      this.sessionOrchestrator.stopSession(chatId);

      this.logger.log(`Stopped response for chat ${chatId}`);
      await ctx.reply('❌ Stopped.');
    } else {
      await ctx.reply('Nothing to stop - bot is not currently responding.');
    }
  }

  private async handleTextMessage(ctx: Context) {
    const message = ctx.message as any;
    const text = message?.text || '';
    const chatId = ctx.chat?.id.toString();

    if (!chatId) return;

    // Check if bot is currently responding - block input
    if (this.streamManager.isResponding(chatId)) {
      await ctx.reply('⏳ Please wait for the current response to complete...');
      return;
    }

    // Handle all messages as conversation (free-form chat)
    await this.handleConversation(ctx, text);
  }

  /**
   * Handle follow-up questions in conversation mode
   */
  private async handleConversation(ctx: Context, message: string) {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    try {
      await ctx.sendChatAction('typing');

      // Get or create session
      let session = this.sessionOrchestrator.getActiveSession(chatId) ||
                    this.sessionOrchestrator.getCompletedSession(chatId);

      if (!session) {
        // Create new session for conversation (no specific ticker)
        session = this.sessionOrchestrator.createSession(chatId, 'GENERAL');
        this.logger.log(`Created new conversation session for chat ${chatId}`);
      }

      // Add user message to history
      this.sessionOrchestrator.addUserMessage(chatId, message);

      // Mark as responding
      this.streamManager.startResponding(chatId);

      // Stream response from Agent
      await this.streamManager.startStream({
        chatId,
        ctx,
        agentUrl: this.agentUrl,
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
    } catch (error) {
      this.logger.error('Failed to handle conversation:', error);
      this.streamManager.stopResponding(chatId);
      await ctx.reply('Failed to process your message. Please try again.');
    }
  }

  /**
   * Show session status
   */
  private async handleStatusCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();

    if (!chatId) return;

    const sessionInfo = this.streamManager.getSessionStatus(chatId);

    if (!sessionInfo) {
      await ctx.reply('No active analysis session.');
      return;
    }

    await ctx.reply(
      `📊 Session Status\n\n` +
      `Stock: ${sessionInfo.ticker}\n` +
      `Status: ${sessionInfo.status}\n` +
      `Started: ${sessionInfo.startedAt}\n\n` +
      `💬 You can ask follow-up questions about this analysis.`
    );
  }

  private async handleStartCommand(ctx: Context) {
    await ctx.reply(
      '👋 Welcome to Stock Analyzer!\n\n' +
        '💬 Just start chatting! Ask me anything about investing, stocks, or finance.\n\n' +
        '📊 Commands:\n' +
        '/analyze TICKER - Run deep analysis (30-60s)\n' +
        '/status - Check session status\n' +
        '/stop - Cancel current response\n' +
        '/help - Show this help\n\n' +
        '💡 Examples:\n' +
        '• "Explain P/E ratios"\n' +
        '• "What makes a stock undervalued?"\n' +
        '• /analyze AAPL (runs full analysis)\n' +
        '• "What\'s the DCF value?" (after analysis)\n\n' +
        '⏱️ Sessions last 1 hour from last activity.'
    );
  }

  private async handleHelpCommand(ctx: Context) {
    await ctx.reply(
      '📖 How to use:\n\n' +
        '💬 Free-Form Chat:\n' +
        '• Just send any message to start chatting\n' +
        '• Ask about investing, valuations, financial concepts\n' +
        '• No commands needed for casual conversation\n\n' +
        '📊 Deep Analysis:\n' +
        '• /analyze AAPL - Run comprehensive 30-60s analysis\n' +
        '• Includes: DCF, ratios, quality assessment, PDF report\n' +
        '• Input blocked during analysis (like Claude)\n\n' +
        '💭 How It Works:\n' +
        '• Bot blocks input while responding (any response)\n' +
        '• You\'ll see "⏳ Please wait..." if you try to send\n' +
        '• Use /stop to cancel current response\n' +
        '• Sessions remember context for 1 hour\n\n' +
        '⚙️ Commands:\n' +
        '• /status - Check session status\n' +
        '• /stop - Cancel current response\n' +
        '• /help - Show this message'
    );
  }

  private async setupWebhook() {
    const domain = this.configService.get<string>('telegram.webhookDomain');
    const path = this.configService.get<string>('telegram.webhookPath');

    if (domain) {
      const webhookUrl = `${domain}${path}`;
      await this.bot.telegram.setWebhook(webhookUrl);
      this.logger.log(`Webhook set: ${webhookUrl}`);
    }
  }
}
