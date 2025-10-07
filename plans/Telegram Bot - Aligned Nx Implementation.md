# Telegram Bot with LLM Streaming - Nx Monorepo Implementation

## Overview

The Telegram bot is part of a unified Nx monorepo architecture that includes three main services:

- **MCP Server**: Provides financial analysis tools via Model Context Protocol
- **Agent**: Orchestrates LLM-based stock analysis using the MCP tools
- **Telegram Bot** (this document): User interface that streams analysis results

The bot acts as a thin application shell (~100 lines) with all business logic residing in libraries, following Nx monorepo best practices. It connects to the Agent service via Server-Sent Events (SSE) to stream raw LLM output directly to users.

## Monorepo Context

```
stock-analyzer-nx/
├── apps/
│   ├── mcp-server/        # MCP tools server
│   ├── agent/             # Analysis orchestration service
│   └── telegram-bot/      # This Telegram bot service
├── libs/
│   ├── mcp/               # MCP domain libraries
│   ├── agent/             # Agent domain libraries
│   ├── bot/               # Bot domain libraries
│   └── shared/            # Shared types, utils, config
```

## Architecture

```
User → Telegram API → Bot Application → Agent Service → MCP Server
                          ↓                    ↓
                    Stream LLM output    Tool execution
                          ↓
                    Update messages
```

## Project Structure

```
apps/telegram-bot/          # Thin NestJS application shell
├── src/
│   ├── main.ts            # Bootstrap (~50 lines)
│   ├── app/
│   │   └── app.module.ts  # Root module (~30 lines)
│   └── environment.ts     # Environment configuration
├── project.json
├── tsconfig.app.json
└── Dockerfile

libs/bot/telegram/         # Core bot logic
├── src/
│   ├── lib/
│   │   ├── telegram-bot.module.ts
│   │   ├── telegram-bot.service.ts
│   │   ├── telegram-bot.update.ts
│   │   ├── telegram-bot.controller.ts
│   │   ├── stream-manager.service.ts
│   │   └── handlers/
│   │       ├── command.handler.ts
│   │       ├── text.handler.ts
│   │       └── stream.handler.ts
│   └── index.ts
└── project.json

libs/shared/               # Shared across all services
├── types/                 # Common TypeScript interfaces
├── utils/                 # Formatting, validation utilities
└── config/                # Configuration helpers
```

## Core Implementation

### Application Bootstrap (apps/telegram-bot/src/main.ts)

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  
  const port = process.env.PORT || 3002;
  await app.listen(port);
  
  Logger.log(
    `Telegram bot is running on: http://localhost:${port}/${globalPrefix}`
  );
}

bootstrap();
```

### Root Module (apps/telegram-bot/src/app/app.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramBotModule } from '@stock-analyzer/bot/telegram';
import telegramConfig from '../environment';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [telegramConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    TelegramBotModule,  // All logic is in the library
  ],
})
export class AppModule {}
```

### Bot Service with Streaming (libs/bot/telegram/src/lib/telegram-bot.service.ts)

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { StreamManagerService } from './stream-manager.service';
// Import shared types from monorepo
import { AnalysisRequest } from '@stock-analyzer/shared/types';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly agentUrl: string;
  private readonly webhookEnabled: boolean;

  constructor(
    private configService: ConfigService,
    private streamManager: StreamManagerService,
  ) {
    const token = this.configService.get<string>('telegram.botToken');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    
    this.bot = new Telegraf(token);
    this.agentUrl = this.configService.get<string>('telegram.agentUrl');
    this.webhookEnabled = this.configService.get<boolean>('telegram.webhookEnabled');
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

  private async setupBot() {
    // Command handlers
    this.bot.command('start', this.handleStartCommand.bind(this));
    this.bot.command('analyze', this.handleAnalyzeCommand.bind(this));
    this.bot.command('stop', this.handleStopCommand.bind(this));
    this.bot.command('help', this.handleHelpCommand.bind(this));
    
    // Message handlers
    this.bot.on('text', this.handleTextMessage.bind(this));
    
    // Error handling
    this.bot.catch((err, ctx) => {
      this.logger.error(`Bot error: ${err.message}`);
      ctx.reply('An error occurred. Please try again.').catch(() => {});
    });
  }

  private async handleAnalyzeCommand(ctx: Context) {
    const text = ctx.message?.['text'] || '';
    const ticker = text.split(' ')[1]?.toUpperCase();
    const chatId = ctx.chat?.id.toString();
    
    if (!ticker) {
      await ctx.reply('Please provide a ticker symbol. Example: /analyze AAPL');
      return;
    }

    if (this.streamManager.hasActiveStream(chatId)) {
      await ctx.reply('An analysis is already running. Use /stop to cancel.');
      return;
    }

    try {
      await ctx.sendChatAction('typing');
      
      const initialMsg = await ctx.reply(
        `Starting analysis for ${ticker}...\n\n` +
        `The Agent will use MCP tools to gather data and generate analysis.\n` +
        `Results will stream here as they're generated.`
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
    
    if (this.streamManager.stopStream(chatId)) {
      await ctx.reply('Analysis stopped.');
    } else {
      await ctx.reply('No active analysis to stop.');
    }
  }

  private async handleTextMessage(ctx: Context) {
    const text = ctx.message?.['text'] || '';
    
    // Check if it's a ticker symbol (1-5 uppercase letters)
    if (/^[A-Z]{1,5}$/.test(text)) {
      // Treat as analyze command
      ctx.message['text'] = `/analyze ${text}`;
      await this.handleAnalyzeCommand(ctx);
    } else {
      await ctx.reply('Send a ticker symbol or use /analyze TICKER');
    }
  }

  private async handleStartCommand(ctx: Context) {
    await ctx.reply(
      'Welcome to Stock Analyzer Bot!\n\n' +
      'This bot connects to our Agent service which uses MCP tools ' +
      'to perform comprehensive financial analysis.\n\n' +
      'Commands:\n' +
      '/analyze TICKER - Analyze a stock\n' +
      '/stop - Stop current analysis\n' +
      '/help - Show help\n\n' +
      'Or just send a ticker symbol like AAPL'
    );
  }

  private async handleHelpCommand(ctx: Context) {
    await ctx.reply(
      'How to use:\n' +
      '• Send /analyze AAPL to analyze Apple\n' +
      '• Or just send AAPL directly\n' +
      '• Use /stop to cancel an analysis\n\n' +
      'The analysis streams in real-time from our Agent service.'
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

  getBot(): Telegraf {
    return this.bot;
  }

  async handleUpdate(update: any): Promise<void> {
    await this.bot.handleUpdate(update);
  }
}
```

### Stream Manager Service (libs/bot/telegram/src/lib/stream-manager.service.ts)

```typescript
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

@Injectable()
export class StreamManagerService {
  private readonly logger = new Logger(StreamManagerService.name);
  private activeStreams = new Map<string, EventSource>();
  private streamBuffers = new Map<string, string>();

  async startStream(config: StreamConfig): Promise<void> {
    const { chatId, ticker, ctx, messageId, agentUrl } = config;
    
    // Connect to Agent's SSE endpoint
    const streamUrl = `${agentUrl}/api/analyze/${ticker}/stream`;
    const params = new URLSearchParams({
      userId: ctx.from?.id.toString() || 'anonymous',
      sessionId: `telegram-${chatId}`,
      platform: 'telegram'
    });

    const eventSource = new EventSource(`${streamUrl}?${params}`);
    this.activeStreams.set(chatId, eventSource);
    this.streamBuffers.set(chatId, '');

    let currentMessageId = messageId;
    let lastUpdateTime = Date.now();
    let updateCounter = 0;

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chunk') {
          // Append raw LLM output to buffer
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
            const displayText = updatedBuffer.length > 3500
              ? '...' + updatedBuffer.slice(-3500)
              : updatedBuffer;

            try {
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                currentMessageId,
                null,
                displayText
              );
            } catch (error) {
              // Handle edit failures
              if (error.message?.includes('message is not modified')) {
                // Content unchanged, skip
              } else if (error.message?.includes('too many requests')) {
                // Rate limited
                this.logger.debug('Rate limited, skipping update');
              } else {
                // Send new message if edit fails
                const newMsg = await ctx.reply(
                  'Continuing...\n\n' + displayText.slice(-3000)
                );
                currentMessageId = newMsg.message_id;
              }
            }
          }
        } else if (data.type === 'complete') {
          // Final update
          const buffer = this.streamBuffers.get(chatId) || '';
          if (buffer) {
            const finalText = buffer.length > 3500
              ? '...' + buffer.slice(-3500)
              : buffer;
            
            try {
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                currentMessageId,
                null,
                finalText
              );
            } catch {
              await ctx.reply(finalText.slice(-3000));
            }
          }

          await ctx.reply(
            `Analysis complete for ${ticker}!\n\n` +
            `PDF Reports:\n` +
            `• [Executive Summary](${agentUrl}/api/pdf/${ticker}/summary)\n` +
            `• [Full Report](${agentUrl}/api/pdf/${ticker}/full)`,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
          );

          this.cleanup(chatId);
        } else if (data.type === 'error') {
          await ctx.reply(`Error: ${data.message}`);
          this.cleanup(chatId);
        }
      } catch (error) {
        this.logger.error('Stream processing error:', error);
      }
    };

    eventSource.onerror = async (error) => {
      this.logger.error('SSE error:', error);
      if (eventSource.readyState === EventSource.CLOSED) {
        await ctx.reply('Connection lost. Please try again if needed.');
        this.cleanup(chatId);
      }
    };

    // Timeout after 5 minutes
    setTimeout(() => {
      if (this.activeStreams.has(chatId)) {
        ctx.reply('Analysis timeout. Please try again if needed.');
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
  }
}
```

### Webhook Controller (libs/bot/telegram/src/lib/telegram-bot.controller.ts)

```typescript
import { Controller, Post, Body, Get, HttpCode } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';

@Controller('telegram')
export class TelegramBotController {
  constructor(private readonly botService: TelegramBotService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() update: any) {
    await this.botService.handleUpdate(update);
    return { ok: true };
  }

  @Get('health')
  health() {
    return {
      status: 'healthy',
      service: 'telegram-bot',
      timestamp: new Date().toISOString(),
    };
  }
}
```

### Library Module (libs/bot/telegram/src/lib/telegram-bot.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { StreamManagerService } from './stream-manager.service';

@Module({
  imports: [ConfigModule],
  controllers: [TelegramBotController],
  providers: [
    TelegramBotService,
    StreamManagerService,
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
```

## Configuration

### Environment Configuration (apps/telegram-bot/src/environment.ts)

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  agentUrl: process.env.NODE_ENV === 'production'
    ? process.env.AGENT_SERVICE_URL || 'http://agent.railway.internal:3001'
    : 'http://localhost:3001',
  webhookEnabled: process.env.NODE_ENV === 'production',
  webhookDomain: process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.WEBHOOK_DOMAIN,
  webhookPath: process.env.WEBHOOK_PATH || '/telegram/webhook',
}));
```

### Environment Variables (.env)

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Agent Service (internal in production)
AGENT_SERVICE_URL=http://localhost:3001

# Production (Railway)
NODE_ENV=production
PORT=3002
RAILWAY_PUBLIC_DOMAIN=auto-provided-by-railway
```

## Monorepo Dependencies

The Telegram bot shares common libraries with other services:

```typescript
// Shared types used across all services
import { AnalysisRequest, AnalysisResult } from '@stock-analyzer/shared/types';
import { formatCurrency, formatPercentage } from '@stock-analyzer/shared/utils';
import { loadEnvironment } from '@stock-analyzer/shared/config';
```

## Package Dependencies

```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "telegraf": "^4.15.0",
    "eventsource": "^2.0.2",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.0"
  }
}
```

## Nx Project Configuration

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/telegram-bot/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/webpack:webpack",
      "outputs": ["{options.outputPath}"],
      "options": {
        "target": "node",
        "compiler": "tsc",
        "outputPath": "dist/apps/telegram-bot",
        "main": "apps/telegram-bot/src/main.ts",
        "tsConfig": "apps/telegram-bot/tsconfig.app.json",
        "generatePackageJson": true
      }
    },
    "serve": {
      "executor": "@nx/js:node",
      "defaultConfiguration": "development",
      "options": {
        "buildTarget": "telegram-bot:build"
      }
    }
  },
  "tags": ["type:app", "platform:node", "scope:bot"]
}
```

## Deployment (Railway)

The bot is deployed as part of the monorepo with internal service communication:

```yaml
# Railway Configuration
Service Name: telegram-bot
Build Command: nx build telegram-bot --configuration=production
Start Command: node dist/apps/telegram-bot/main.js
Health Check Path: /api/telegram/health
Port: 3002
Generate Domain: YES (for webhook)

# Internal Communication
Agent Service: http://agent.railway.internal:3001
MCP Server: Runs as subprocess of Agent (stdio mode)
```

## Service Communication Flow

1. **User → Telegram Bot**: Commands via Telegram API
1. **Bot → Agent**: SSE connection to stream endpoint
1. **Agent → MCP Server**: Tool execution via stdio
1. **Agent → Bot**: Streams raw LLM output
1. **Bot → User**: Updates Telegram messages with streamed content

## Key Features

1. **Monorepo Integration**: Shares types and utilities with Agent and MCP services
1. **Pure LLM Streaming**: Forwards raw output without processing
1. **Efficient Updates**: Batches updates to respect Telegram rate limits
1. **Clean Architecture**: Thin app shell with logic in libraries
1. **Stream Management**: One stream per chat with proper cleanup
1. **Internal Networking**: Communicates with Agent via Railway’s internal network

## Development Commands

```bash
# Development (runs all services)
nx run-many --target=serve --all

# Run just the bot
nx serve telegram-bot

# Build
nx build telegram-bot

# Test
nx test telegram-bot
nx test bot-telegram  # Test the library

# Lint
nx lint telegram-bot

# See dependencies
nx graph --focus=telegram-bot
```

This implementation provides a clean, maintainable Telegram bot that’s part of a larger Nx monorepo architecture, streaming LLM analysis output while maintaining separation of concerns between the MCP tools server, Agent orchestration, and the bot interface.