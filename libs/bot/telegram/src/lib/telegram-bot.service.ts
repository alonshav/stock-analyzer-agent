import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { StreamManagerService } from './stream-manager.service';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly agentUrl: string;
  private readonly webhookEnabled: boolean;

  constructor(
    private configService: ConfigService,
    private streamManager: StreamManagerService
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

  async onModuleInit() {
    await this.setupBot();

    if (!this.webhookEnabled) {
      await this.bot.launch();
      this.logger.log('Bot started in polling mode');
    } else {
      await this.setupWebhook();
    }
  }

  async handleUpdate(update: any): Promise<void> {
    await this.bot.handleUpdate(update);
  }

  private async setupBot() {
    // Command handlers
    this.bot.command('start', this.handleStartCommand.bind(this));
    this.bot.command('analyze', this.handleAnalyzeCommand.bind(this));
    this.bot.command('stop', this.handleStopCommand.bind(this));
    this.bot.command('help', this.handleHelpCommand.bind(this));

    // Message handlers
    this.bot.on('text', this.handleTextMessage.bind(this));

    // Error handling
    this.bot.catch((err: unknown, ctx) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Bot error: ${errorMessage}`);
      ctx.reply('An error occurred. Please try again.').catch(() => {});
    });
  }

  private async handleAnalyzeCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const ticker = text.split(' ')[1]?.toUpperCase();
    const chatId = ctx.chat?.id.toString();

    if (!ticker) {
      await ctx.reply('Please provide a ticker symbol. Example: /analyze AAPL');
      return;
    }

    if (!chatId || this.streamManager.hasActiveStream(chatId)) {
      await ctx.reply('An analysis is already running. Use /stop to cancel.');
      return;
    }

    try {
      await ctx.sendChatAction('typing');

      const initialMsg = await ctx.reply(
        `Analyzing ${ticker}...`
      );

      // Start streaming from Agent service
      await this.streamManager.startStream({
        chatId,
        ticker,
        ctx,
        messageId: initialMsg.message_id,
        agentUrl: this.agentUrl,
      });
    } catch (error) {
      this.logger.error('Failed to start analysis:', error);
      await ctx.reply('Failed to start analysis. Please try again.');
    }
  }

  private async handleStopCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();

    if (chatId && this.streamManager.stopStream(chatId)) {
      await ctx.reply('❌ Analysis stopped.');
    } else {
      await ctx.reply('No active analysis to stop.');
    }
  }

  private async handleTextMessage(ctx: Context) {
    const text = (ctx.message as any)?.text || '';

    // Check if it's a ticker symbol (1-5 uppercase letters)
    if (/^[A-Z]{1,5}$/.test(text)) {
      // Treat as analyze command
      (ctx.message as any).text = `/analyze ${text}`;
      await this.handleAnalyzeCommand(ctx);
    } else {
      await ctx.reply('Send a ticker symbol or use /analyze TICKER');
    }
  }

  private async handleStartCommand(ctx: Context) {
    await ctx.reply(
      '👋 Welcome to Stock Analyzer Bot!\n\n' +
        'This bot connects to our Agent service which uses financial analysis tools ' +
        'to perform comprehensive stock analysis.\n\n' +
        '📋 Commands:\n' +
        '/analyze TICKER - Analyze a stock\n' +
        '/stop - Stop current analysis\n' +
        '/help - Show help\n\n' +
        '💡 Or just send a ticker symbol like AAPL'
    );
  }

  private async handleHelpCommand(ctx: Context) {
    await ctx.reply(
      '📖 How to use:\n\n' +
        '• Send /analyze AAPL to analyze Apple\n' +
        '• Or just send AAPL directly\n' +
        '• Use /stop to cancel an analysis\n\n' +
        '⚡ The analysis streams in real-time from our Agent service.\n' +
        "📊 You'll see tool usage and thinking process as it happens.\n" +
        '✅ Final executive summary will be delivered when complete.'
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
