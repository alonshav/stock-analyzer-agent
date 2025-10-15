import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { StreamManagerService } from './stream-manager.service';
import { SessionOrchestrator } from '@stock-analyzer/bot/sessions';
import { WorkflowType } from '@stock-analyzer/shared/types';
import { BotMessages } from '@stock-analyzer/bot/common';

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
    this.bot.command('new', this.handleNewCommand.bind(this));      // NEW
    this.bot.command('reset', this.handleResetCommand.bind(this));  // NEW (alias)

    // Message handlers - route to conversation
    this.bot.on('text', this.handleTextMessage.bind(this));

    // Error handling
    this.bot.catch((err: unknown, ctx) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Bot error: ${errorMessage}`);
      ctx.reply(BotMessages.GENERIC_ERROR).catch(() => {
        // Ignore reply failures
      });
    });
  }

  /**
   * /analyze TICKER - Execute workflow
   * Simplified: Single method call to StreamManager
   */
  private async handleAnalyzeCommand(ctx: Context) {
    const message = ctx.message as any;
    const text = message?.text || '';
    const ticker = text.split(' ')[1]?.toUpperCase();
    const chatId = ctx.chat?.id.toString();

    if (!ticker) {
      await ctx.reply(BotMessages.ANALYZE_USAGE);
      return;
    }

    if (!chatId) {
      await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
      return;
    }

    // Check if bot is currently responding
    if (this.streamManager.isResponding(chatId)) {
      await ctx.reply(BotMessages.WAIT_FOR_RESPONSE);
      return;
    }

    try {
      await ctx.sendChatAction('typing');
      await ctx.reply(BotMessages.STARTING_ANALYSIS(ticker));

      // Execute workflow (StreamManager handles session, tracking, and execution)
      await this.streamManager.executeWorkflow(
        chatId,
        WorkflowType.FULL_ANALYSIS,
        ticker,
        ctx,
        this.agentUrl
      );
    } catch (error) {
      this.logger.error(`[${chatId}] Error executing workflow:`, error);
      await ctx.reply(BotMessages.ANALYSIS_FAILED(ticker));
    }
  }

  /**
   * /stop - Stop current response
   */
  private async handleStopCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();

    if (!chatId) {
      await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
      return;
    }

    // Check if bot is responding
    if (this.streamManager.isResponding(chatId)) {
      // Stop stream in StreamManager
      this.streamManager.stopStream(chatId);

      // Stop responding flag
      this.streamManager.stopResponding(chatId);

      // Stop session in SessionOrchestrator
      this.sessionOrchestrator.stopSession(chatId, 'User stopped response');

      this.logger.log(`Stopped response for chat ${chatId}`);
      await ctx.reply('❌ Stopped.');
    } else {
      await ctx.reply('Nothing to stop - bot is not currently responding.');
    }
  }

  /**
   * /new - Start fresh session
   */
  private async handleNewCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) {
      await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
      return;
    }

    try {
      // Stop current session (if exists)
      const currentSession = this.sessionOrchestrator.getSession(chatId);
      if (currentSession) {
        this.sessionOrchestrator.stopSession(chatId, 'User started new session');
        this.logger.log(`[${chatId}] Stopped session: ${currentSession.sessionId}`);
      }

      // Create new session
      const newSession = this.sessionOrchestrator.getOrCreateSession(chatId);
      this.logger.log(`[${chatId}] Created new session: ${newSession.sessionId}`);

      await ctx.reply(BotMessages.NEW_SESSION);
    } catch (error) {
      this.logger.error(`[${chatId}] Error starting new session:`, error);
      await ctx.reply(BotMessages.NEW_SESSION_FAILED);
    }
  }

  /**
   * /reset - Alias for /new
   */
  private async handleResetCommand(ctx: Context) {
    return this.handleNewCommand(ctx);
  }

  /**
   * Handle text messages - Default to conversation
   * Simplified: Single method call to StreamManager
   */
  private async handleTextMessage(ctx: Context) {
    const message = ctx.message as any;
    const text = message?.text || '';
    const chatId = ctx.chat?.id.toString();

    if (!chatId) return;

    // Check if bot is currently responding - block input
    if (this.streamManager.isResponding(chatId)) {
      await ctx.reply(BotMessages.WAIT_FOR_RESPONSE);
      return;
    }

    try {
      await ctx.sendChatAction('typing');

      // Execute conversation (StreamManager handles session, history, and execution)
      await this.streamManager.executeConversation(
        chatId,
        text,
        ctx,
        this.agentUrl
      );
    } catch (error) {
      this.logger.error(`[${chatId}] Error executing conversation:`, error);
      await ctx.reply(BotMessages.CONVERSATION_FAILED);
    }
  }

  /**
   * /status - Show session info
   */
  private async handleStatusCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();

    if (!chatId) {
      await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
      return;
    }

    try {
      const session = this.sessionOrchestrator.getSession(chatId);

      if (!session) {
        await ctx.reply(BotMessages.NO_ACTIVE_SESSION);
        return;
      }

      // Build status message
      const duration = Date.now() - session.createdAt.getTime();
      const durationStr = this.formatDuration(duration);
      const messageCount = session.conversationHistory.length;
      const workflowCount = session.workflows.length;

      let statusMsg = `📊 Session Status\n\n`;
      statusMsg += `Session ID: ${session.sessionId}\n`;
      statusMsg += `Status: ${session.status}\n`;
      statusMsg += `Duration: ${durationStr}\n`;
      statusMsg += `Messages: ${messageCount}\n`;
      statusMsg += `Workflows: ${workflowCount}\n`;

      if (workflowCount > 0) {
        statusMsg += `\nRecent Workflows:\n`;
        session.workflows.slice(-3).forEach(wf => {
          statusMsg += `• ${wf.workflowType}`;
          if (wf.ticker) statusMsg += ` (${wf.ticker})`;
          statusMsg += wf.completedAt ? ' ✓' : ' (in progress)';
          statusMsg += '\n';
        });
      }

      statusMsg += `\nUse /new to start fresh or continue chatting!`;

      await ctx.reply(statusMsg);

    } catch (error) {
      this.logger.error(`[${chatId}] Error getting status:`, error);
      await ctx.reply(BotMessages.SESSION_STATUS_FAILED);
    }
  }

  /**
   * /start - Welcome message
   */
  private async handleStartCommand(ctx: Context) {
    await ctx.reply(
      '👋 Welcome to Stock Analyzer!\n\n' +
        '💬 Just start chatting! Ask me anything about investing, stocks, or finance.\n\n' +
        '📊 Commands:\n' +
        '/analyze TICKER - Run deep analysis (30-60s)\n' +
        '/status - Check session status\n' +
        '/new - Start fresh session\n' +
        '/stop - Cancel current response\n' +
        '/help - Show this help\n\n' +
        '💡 Examples:\n' +
        '• "Explain P/E ratios"\n' +
        '• "What makes a stock undervalued?"\n' +
        '• /analyze AAPL (runs full analysis)\n' +
        '• "What\'s the DCF value?" (after analysis)\n\n' +
        '⏱️ Sessions persist until you use /new'
    );
  }

  /**
   * /help - Help message
   */
  private async handleHelpCommand(ctx: Context) {
    await ctx.reply(BotMessages.HELP_TEXT);
  }

  /**
   * Format duration to human-readable string
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Setup webhook for production
   */
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
