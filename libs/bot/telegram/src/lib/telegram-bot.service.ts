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

    // Check for active session via SessionOrchestrator
    if (this.sessionOrchestrator.hasActiveSession(chatId)) {
      await ctx.reply('An analysis is already running. Use /stop to cancel.');
      return;
    }

    try {
      await ctx.sendChatAction('typing');

      // Create session via SessionOrchestrator
      const session = this.sessionOrchestrator.createSession(chatId, ticker);

      this.logger.log(
        `Created session ${session.sessionId} for chat ${chatId}, ticker ${ticker}`
      );

      // Start streaming from Agent service (StreamManager will use the session)
      await this.streamManager.startStream({
        chatId,
        ctx,
        agentUrl: this.agentUrl,
        workflowRequest: {
          sessionId: session.sessionId,
          workflowType: WorkflowType.FULL_ANALYSIS,
          params: {
            ticker,
            userPrompt: message,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to start analysis:', error);
      await ctx.reply('Failed to start analysis. Please try again.');
    }
  }

  private async handleStopCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();

    if (!chatId) {
      await ctx.reply('Unable to identify chat. Please try again.');
      return;
    }

    // Check if there's an active session or stream
    const hasStream = this.streamManager.hasActiveStream(chatId);
    const hasSession = this.sessionOrchestrator.hasActiveSession(chatId) ||
                       this.sessionOrchestrator.hasCompletedSession(chatId);

    if (hasStream || hasSession) {
      // Stop stream in StreamManager
      this.streamManager.stopStream(chatId);

      // Stop session in SessionOrchestrator
      this.sessionOrchestrator.stopSession(chatId);

      this.logger.log(`Stopped analysis for chat ${chatId}`);
      await ctx.reply('❌ Analysis stopped.');
    } else {
      await ctx.reply('No active analysis to stop.');
    }
  }

  private async handleTextMessage(ctx: Context) {
    const message = ctx.message as any;
    const text = message?.text || '';
    const chatId = ctx.chat?.id.toString();

    if (!chatId) return;

    // Check if there's an active session
    const hasActiveSession = this.streamManager.hasActiveSession(chatId);

    // Check if it's a ticker symbol (1-5 uppercase letters)
    if (/^[A-Z]{1,5}$/.test(text)) {
      if (hasActiveSession) {
        // Ask for confirmation before starting new analysis
        await ctx.reply(
          `You have an active analysis session. Reply with:
• "yes" to start analyzing ${text}
• Or ask a question about the current analysis`
        );
        return;
      }

      // Treat as analyze command
      message.text = `/analyze ${text}`;
      await this.handleAnalyzeCommand(ctx);
    } else if (hasActiveSession) {
      // Route to conversation mode
      await this.handleConversation(ctx, text);
    } else {
      await ctx.reply(
        'No active analysis session.\n\n' +
        'Send a ticker symbol (e.g., AAPL) or use /analyze TICKER to start.'
      );
    }
  }

  /**
   * Handle follow-up questions in conversation mode
   */
  private async handleConversation(ctx: Context, message: string) {
    const chatId = ctx.chat?.id.toString();

    if (!chatId) return;

    try {
      await ctx.sendChatAction('typing');
      await ctx.reply('💭 Thinking...');

      // Stream conversation response from Agent
      await this.streamManager.startConversation(
        chatId,
        message,
        ctx,
        this.agentUrl
      );
    } catch (error) {
      this.logger.error('Failed to handle conversation:', error);
      await ctx.reply('Failed to process your question. Please try again.');
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
      '👋 Welcome to Stock Analyzer Bot!\n\n' +
        'This bot uses an AI agent with financial analysis tools ' +
        'to perform comprehensive stock analysis.\n\n' +
        '📋 Commands:\n' +
        '/analyze TICKER - Start new analysis\n' +
        '/status - Check active session\n' +
        '/stop - Stop current analysis\n' +
        '/help - Show detailed help\n\n' +
        '💡 Tips:\n' +
        '• Just send a ticker symbol (e.g., AAPL)\n' +
        '• Ask follow-up questions during active sessions\n' +
        '• Sessions auto-expire after 1 hour'
    );
  }

  private async handleHelpCommand(ctx: Context) {
    await ctx.reply(
      '📖 How to use:\n\n' +
        '🔍 Start Analysis:\n' +
        '• /analyze AAPL - Analyze Apple Inc.\n' +
        '• Or just send: AAPL\n\n' +
        '💬 Conversation Mode:\n' +
        '• Once analysis starts, ask questions:\n' +
        '  "What is the P/E ratio?"\n' +
        '  "How does it compare to peers?"\n' +
        '  "What are the risks?"\n\n' +
        '⚙️ Controls:\n' +
        '• /status - View active session\n' +
        '• /stop - Cancel analysis\n\n' +
        '⚡ Real-time streaming shows:\n' +
        '• Tool usage (data fetching, calculations)\n' +
        '• Thinking process\n' +
        '• Progressive analysis updates\n\n' +
        '📊 Sessions expire after 1 hour of inactivity.'
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
