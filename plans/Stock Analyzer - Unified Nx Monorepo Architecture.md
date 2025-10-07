# Stock Analyzer - Unified Nx Monorepo Architecture

## Executive Summary

Three-service monorepo with maximum code reuse:

- **MCP Server**: Financial data tools via MCP protocol
- **Agent**: NestJS service with Anthropic SDK + SSE streaming
- **Telegram Bot**: NestJS service consuming Agent’s SSE endpoint

**Critical Design Decisions:**

1. Agent uses Anthropic SDK with direct tool integration (NOT MCP client)
1. Agent is NestJS REST/SSE server (NOT CLI)
1. MCP Server runs independently (can be subprocess or separate service)
1. All business logic lives in libraries
1. Apps are thin shells (~50-100 lines)

-----

## Complete Directory Structure

stock-analyzer-nx/
├── apps/                           # Thin application shells
│   ├── mcp-server/                 # MCP Server (50 lines)
│   │   ├── src/
│   │   │   ├── main.ts            # Bootstrap MCP server
│   │   │   └── environment.ts
│   │   ├── project.json
│   │   ├── tsconfig.app.json
│   │   └── Dockerfile
│   │
│   ├── agent/                      # Agent Service (50 lines)
│   │   ├── src/
│   │   │   ├── main.ts            # NestJS bootstrap
│   │   │   └── environment.ts
│   │   ├── project.json
│   │   ├── tsconfig.app.json
│   │   └── Dockerfile
│   │
│   └── telegram-bot/               # Telegram Bot (50 lines)
│       ├── src/
│       │   ├── main.ts            # NestJS bootstrap
│       │   ├── app/
│       │   │   └── app.module.ts
│       │   └── environment.ts
│       ├── project.json
│       ├── tsconfig.app.json
│       └── Dockerfile
│
├── libs/                           # All business logic
│   ├── mcp/                        # MCP Domain
│   │   ├── tools/                  # Tool implementations
│   │   │   ├── src/lib/
│   │   │   │   ├── data-fetching/
│   │   │   │   │   ├── fetch-company-data.tool.ts
│   │   │   │   │   ├── fetch-market-data.tool.ts
│   │   │   │   │   ├── fetch-peer-companies.tool.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── analysis/
│   │   │   │   │   ├── dcf-calculator.tool.ts
│   │   │   │   │   ├── handoff-tests.tool.ts
│   │   │   │   │   ├── rule-of-40.tool.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── pdf/
│   │   │   │   │   └── generate-pdf.tool.ts
│   │   │   │   └── registry.ts     # getToolsRegistry()
│   │   │   └── index.ts
│   │   │
│   │   ├── server/                 # MCP server implementation
│   │   │   ├── src/lib/
│   │   │   │   ├── mcp-server.class.ts
│   │   │   │   ├── transport.ts
│   │   │   │   └── tool-loader.ts
│   │   │   └── index.ts
│   │   │
│   │   └── integrations/           # External API adapters
│   │       ├── src/lib/
│   │       │   ├── fmp/
│   │       │   │   ├── fmp.adapter.ts
│   │       │   │   └── fmp.types.ts
│   │       │   ├── alpha-vantage/
│   │       │   └── sec-edgar/
│   │       └── index.ts
│   │
│   ├── agent/                      # Agent Domain
│   │   ├── core/                   # Core agent logic
│   │   │   ├── src/lib/
│   │   │   │   ├── agent.module.ts
│   │   │   │   ├── agent.service.ts
│   │   │   │   ├── stream.service.ts
│   │   │   │   └── prompts/
│   │   │   │       └── framework-v2.3.ts
│   │   │   └── index.ts
│   │   │
│   │   └── api/                    # REST + SSE endpoints
│   │       ├── src/lib/
│   │       │   ├── api.module.ts
│   │       │   ├── analysis.controller.ts
│   │       │   ├── sse.controller.ts
│   │       │   └── dto/
│   │       └── index.ts
│   │
│   ├── bot/                        # Bot Domain
│   │   ├── telegram/               # Telegram implementation
│   │   │   ├── src/lib/
│   │   │   │   ├── telegram-bot.module.ts
│   │   │   │   ├── telegram-bot.service.ts
│   │   │   │   ├── telegram-bot.controller.ts
│   │   │   │   ├── stream-manager.service.ts
│   │   │   │   └── handlers/
│   │   │   │       ├── command.handler.ts
│   │   │   │       └── text.handler.ts
│   │   │   └── index.ts
│   │   │
│   │   └── common/                 # Shared bot utilities
│   │       └── src/lib/
│   │           ├── message-processor.ts
│   │           └── attachment-handler.ts
│   │
│   └── shared/                     # Shared across all services
│       ├── types/                  # TypeScript interfaces
│       │   └── src/lib/
│       │       ├── analysis.types.ts
│       │       ├── company.types.ts
│       │       ├── market.types.ts
│       │       └── common.types.ts
│       │
│       ├── schemas/                # Zod validation
│       │   └── src/lib/
│       │       ├── analysis.schema.ts
│       │       └── request.schema.ts
│       │
│       ├── utils/                  # Common utilities
│       │   └── src/lib/
│       │       ├── formatters/
│       │       │   ├── number.formatter.ts
│       │       │   ├── date.formatter.ts
│       │       │   └── currency.formatter.ts
│       │       ├── validators/
│       │       │   └── ticker.validator.ts
│       │       └── logger/
│       │           └── logger.ts
│       │
│       └── config/                 # Configuration
│           └── src/lib/
│               ├── environment.config.ts
│               └── api-keys.config.ts
│
├── tools/                          # Nx workspace tools
│   └── scripts/
│
├── docs/                           # Documentation
│   ├── architecture/
│   ├── api/
│   └── framework/
│
├── nx.json
├── package.json
├── tsconfig.base.json
└── README.md

```
---

## Architecture Flow

User → Telegram API → Telegram Bot
                         ↓
                     HTTP/SSE Request
                         ↓
                   Agent Service (NestJS)
                         ↓
                 Anthropic SDK query()
                         ↓
                   Tools from Registry
                         ↓
             @stock-analyzer/mcp/tools
                         ↓
                 External APIs + PDF

**Key Points:**
- Agent does NOT use MCP client
- Agent imports tools directly from `@stock-analyzer/mcp/tools`
- MCP Server can run independently (optional)
- Tools are provided to Anthropic SDK as direct function objects

---

## Core Implementation Files

### 1. Agent Bootstrap (apps/agent/src/main.ts)

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@stock-analyzer/agent/core';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  const host = '0.0.0.0';
  await app.listen(port, host);
  
  Logger.log(`Agent API running on ${host}:${port}`, 'Bootstrap');
}

bootstrap();
```

### 2. Agent Module (libs/agent/core/src/lib/agent.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { StreamService } from './stream.service';
import { ApiModule } from '@stock-analyzer/agent/api';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ApiModule,
  ],
  providers: [AgentService, StreamService],
  exports: [AgentService, StreamService],
})
export class AppModule {}
```

### 3. Agent Service (libs/agent/core/src/lib/agent.service.ts)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { STOCK_VALUATION_FRAMEWORK } from './prompts/framework-v2.3';
import { getToolsRegistry } from '@stock-analyzer/mcp/tools';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly tools = getToolsRegistry();

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2
  ) {}

  async analyzeStock(
    ticker: string,
    userPrompt: string,
    options?: AnalysisOptions,
    sessionId?: string
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Phase 1: Full Analysis Query
    const fullAnalysis = await this.executeQuery(
      ticker,
      userPrompt,
      sessionId,
      'full-analysis'
    );

    // Phase 2: Executive Summary Query
    const summaryPrompt = `Based on the following analysis, create an executive summary:\n\n${fullAnalysis}`;
    const executiveSummary = await this.executeQuery(
      ticker,
      summaryPrompt,
      sessionId,
      'executive-summary'
    );

    const result: AnalysisResult = {
      ticker,
      timestamp: new Date().toISOString(),
      fullAnalysis,
      executiveSummary,
      metadata: {
        analysisDate: new Date().toISOString(),
        framework: 'v2.3',
        model: this.config.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514',
        duration: Date.now() - startTime,
      },
    };

    if (sessionId) {
      this.eventEmitter.emit(`analysis.complete.${sessionId}`, result);
    }

    return result;
  }

  private async executeQuery(
    ticker: string,
    prompt: string,
    sessionId: string | undefined,
    phase: string
  ): Promise<string> {
    let fullContent = '';

    const stream = query(prompt, {
      systemPrompt: STOCK_VALUATION_FRAMEWORK,
      model: this.config.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514',
      maxTokens: parseInt(this.config.get('ANTHROPIC_MAX_TOKENS') || '16000'),
      maxTurns: parseInt(this.config.get('ANTHROPIC_MAX_TURNS') || '20'),
      tools: this.tools, // ← Tools provided directly
    });

    for await (const message of stream) {
      if (message.type === 'assistant' && message.content) {
        const content = Array.isArray(message.content)
          ? message.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
          : message.content;

        // Only emit streaming events during thought process
        if (sessionId && phase === 'full-analysis') {
          this.eventEmitter.emit(`analysis.chunk.${sessionId}`, {
            ticker,
            content,
            phase,
            timestamp: new Date().toISOString(),
          });
        }

        fullContent += content;
      }

      if (message.type === 'tool_use') {
        this.logger.debug(`Tool called: ${message.name}`);
        
        if (sessionId) {
          this.eventEmitter.emit(`analysis.tool.${sessionId}`, {
            ticker,
            toolName: message.name,
            toolId: message.id,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return fullContent;
  }
}
```

### 4. SSE Controller (libs/agent/api/src/lib/sse.controller.ts)

```typescript
import { Controller, Get, Param, Query, Res, Req, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { StreamService } from '@stock-analyzer/agent/core';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller('api/analyze')
export class SSEController {
  private readonly logger = new Logger(SSEController.name);

  constructor(
    private streamService: StreamService,
    private eventEmitter: EventEmitter2
  ) {}

  @Get(':ticker/stream')
  async streamAnalysis(
    @Param('ticker') ticker: string,
    @Query('userId') userId: string = 'anonymous',
    @Query('sessionId') sessionId: string,
    @Query('platform') platform: string = 'web',
    @Query('prompt') userPrompt: string,
    @Res() res: Response,
    @Req() req: Request
  ) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let streamId: string;

    try {
      streamId = await this.streamService.startAnalysisStream({
        ticker: ticker.toUpperCase(),
        userPrompt: userPrompt || `Analyze ${ticker} using Framework v2.3`,
        userId,
        sessionId: sessionId || `sse-${Date.now()}`,
        platform,
        options: { generatePDF: true },
      });

      res.write(`data: ${JSON.stringify({ type: 'connected', streamId, ticker })}\n\n`);

      // Event listeners
      const chunkListener = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', ...data })}\n\n`);
      };

      const completeListener = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'complete', ...data })}\n\n`);
        res.end();
      };

      this.eventEmitter.on(`analysis.chunk.${streamId}`, chunkListener);
      this.eventEmitter.on(`analysis.complete.${streamId}`, completeListener);

      req.on('close', () => {
        this.eventEmitter.removeListener(`analysis.chunk.${streamId}`, chunkListener);
        this.eventEmitter.removeListener(`analysis.complete.${streamId}`, completeListener);
        this.streamService.endSession(streamId);
      });
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  }
}
```

### 5. Telegram Bot Bootstrap (apps/telegram-bot/src/main.ts)

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
  
  Logger.log(`Telegram bot running on port ${port}`);
}

bootstrap();
```

### 6. Telegram Bot Service (libs/bot/telegram/src/lib/telegram-bot.service.ts)

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { StreamManagerService } from './stream-manager.service';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly agentUrl: string;

  constructor(
    private configService: ConfigService,
    private streamManager: StreamManagerService,
  ) {
    const token = this.configService.get<string>('telegram.botToken');
    this.bot = new Telegraf(token);
    this.agentUrl = this.configService.get<string>('telegram.agentUrl');
  }

  async onModuleInit() {
    this.bot.command('analyze', this.handleAnalyzeCommand.bind(this));
    await this.bot.launch();
    this.logger.log('Bot started');
  }

  private async handleAnalyzeCommand(ctx: Context) {
    const text = ctx.message?.['text'] || '';
    const ticker = text.split(' ')[1]?.toUpperCase();
    const chatId = ctx.chat?.id.toString();

    if (!ticker) {
      await ctx.reply('Usage: /analyze AAPL');
      return;
    }

    const initialMsg = await ctx.reply(`Starting analysis for ${ticker}...`);

    await this.streamManager.startStream({
      chatId,
      ticker,
      ctx,
      messageId: initialMsg.message_id,
      agentUrl: this.agentUrl,
    });
  }
}
```

### 7. MCP Bootstrap (apps/mcp-server/src/main.ts)

```typescript
import { MCPServer } from '@stock-analyzer/mcp/server';
import { getToolsRegistry } from '@stock-analyzer/mcp/tools';
import { loadEnvironment } from '@stock-analyzer/shared/config';

async function bootstrap() {
  const config = loadEnvironment();
  const tools = getToolsRegistry();
  
  const server = new MCPServer({
    name: 'stock-analyzer-mcp',
    version: '1.0.0',
    tools,
  });

  await server.start();
}

bootstrap();
```

-----

## TypeScript Path Mappings (tsconfig.base.json)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@stock-analyzer/mcp/tools": ["libs/mcp/tools/src/index.ts"],
      "@stock-analyzer/mcp/server": ["libs/mcp/server/src/index.ts"],
      "@stock-analyzer/mcp/integrations": ["libs/mcp/integrations/src/index.ts"],
      "@stock-analyzer/agent/core": ["libs/agent/core/src/index.ts"],
      "@stock-analyzer/agent/api": ["libs/agent/api/src/index.ts"],
      "@stock-analyzer/bot/telegram": ["libs/bot/telegram/src/index.ts"],
      "@stock-analyzer/bot/common": ["libs/bot/common/src/index.ts"],
      "@stock-analyzer/shared/types": ["libs/shared/types/src/index.ts"],
      "@stock-analyzer/shared/schemas": ["libs/shared/schemas/src/index.ts"],
      "@stock-analyzer/shared/utils": ["libs/shared/utils/src/index.ts"],
      "@stock-analyzer/shared/config": ["libs/shared/config/src/index.ts"]
    }
  }
}
```

-----

## Library Dependencies

shared/types ← shared/schemas ← shared/utils
↑              ↑                ↑
│              │                │
mcp/tools ←── mcp/integrations ──────┘
↑  
│  
agent/core ← agent/api
↑
bot/common
↑
bot/telegram

**Critical Rule:** Agent does NOT depend on `mcp/server`, only on `mcp/tools`

-----

## Environment Variables

Agent Service:

- NODE_ENV=production
- PORT=3001
- ANTHROPIC_API_KEY=sk-ant-…
- ANTHROPIC_MODEL=claude-sonnet-4-20250514
- ANTHROPIC_MAX_TOKENS=16000
- ANTHROPIC_MAX_TURNS=20
- PDF_STORAGE_PATH=/app/storage/pdfs
- PUBLIC_URL=https://agent.railway.app

Telegram Bot:

- PORT=3002
- TELEGRAM_BOT_TOKEN=…
- AGENT_SERVICE_URL=http://agent.railway.internal:3001

MCP Server (optional separate deployment):

- PORT=3003
- FMP_API_KEY=…
- ALPHA_VANTAGE_KEY=…
- SEC_EDGAR_EMAIL=contact@example.com

Shared:

- REDIS_URL=redis://…

-----

## Railway Deployment

### Service: agent (Port 3001)

- **Build:** `npm run build:agent`
- **Start:** `npm run start:agent`
- **Health:** `/health`

### Service: telegram-bot (Port 3002)

- **Build:** `npm run build:telegram-bot`
- **Start:** `npm run start:telegram-bot`
- **Health:** `/api/health`

### Service: mcp-server (Port 3003, Optional)

- **Build:** `npm run build:mcp-server`
- **Start:** `npm run start:mcp-server`
- Can also run as stdio subprocess of Agent

-----

## Package.json Scripts

Development:

- `npm run dev` - Run all services in parallel
- `npm run dev:agent` - Run agent only
- `npm run dev:bot` - Run bot only
- `npm run dev:mcp` - Run MCP server only

Build (Production):

- `npm run build:agent` - Build agent
- `npm run build:telegram-bot` - Build bot
- `npm run build:mcp-server` - Build MCP server

Start (Production):

- `npm run start:agent` - Start agent from dist
- `npm run start:telegram-bot` - Start bot from dist
- `npm run start:mcp-server` - Start MCP from dist

Testing & Quality:

- `npm run test` - Run all tests
- `npm run lint` - Lint all code
- `npm run graph` - View dependency graph

-----

## Key Design Principles

1. ✅ **Apps are Thin Shells** (~50-100 lines each)
1. ✅ **All Logic in Libraries** (business logic, not deployment)
1. ✅ **Agent Uses Anthropic SDK** (NOT MCP client)
1. ✅ **Direct Tool Integration** (tools imported from `@stock-analyzer/mcp/tools`)
1. ✅ **SSE Streaming** (Agent streams to Bot via SSE)
1. ✅ **NestJS for Agent** (REST API + SSE, NOT CLI)
1. ✅ **Shared Types Everywhere** (maximum type safety)
1. ✅ **Independent Deployments** (each app can deploy separately)

-----

## What Changed from Original Plans

### Agent Plan Corrections:

- ❌ **Removed:** CLI mode (agent.ts, server.ts split)
- ✅ **Added:** Single NestJS application
- ✅ **Clarified:** Tools come from `@stock-analyzer/mcp/tools`, not MCP client

### Architecture Plan Corrections:

- ❌ **Removed:** `agent/pdf` library (PDF is now an MCP tool)
- ❌ **Removed:** `workflow.orchestrator.ts` (simplified to AgentService)
- ❌ **Removed:** `mcp-client.ts` (Agent doesn’t use MCP client)
- ✅ **Added:** `stream.service.ts` for SSE session management
- ✅ **Clarified:** Agent imports tools directly, not via MCP protocol

### Telegram Plan Corrections:

- ✅ **Aligned:** Port numbers (3002)
- ✅ **Aligned:** Agent URL configuration
- ✅ **Clarified:** SSE consumption pattern

-----

## Development Workflow

Initial setup:
`npx create-nx-workspace@latest stock-analyzer-nx --preset=ts`

Generate apps:

- `nx g @nx/nest:app agent`
- `nx g @nx/nest:app telegram-bot`
- `nx g @nx/node:app mcp-server`

Generate libraries:

- `nx g @nx/js:lib mcp/tools --directory=libs/mcp/tools`
- `nx g @nx/js:lib mcp/server --directory=libs/mcp/server`
- `nx g @nx/js:lib mcp/integrations --directory=libs/mcp/integrations`
- `nx g @nx/js:lib agent/core --directory=libs/agent/core`
- `nx g @nx/js:lib agent/api --directory=libs/agent/api`
- `nx g @nx/nest:lib bot/telegram --directory=libs/bot/telegram`
- `nx g @nx/js:lib bot/common --directory=libs/bot/common`
- `nx g @nx/js:lib shared/types --directory=libs/shared/types`
- `nx g @nx/js:lib shared/utils --directory=libs/shared/utils`
- `nx g @nx/js:lib shared/config --directory=libs/shared/config`

Development commands:

- `nx serve agent` - Agent on 3001
- `nx serve telegram-bot` - Bot on 3002
- `nx serve mcp-server` - MCP on 3003

Build for production:

- `nx build agent --configuration=production`
- `nx build telegram-bot --configuration=production`

Run tests:

- `nx test agent-core`
- `nx test bot-telegram`

View dependency graph:

- `nx graph`

-----

## Testing Strategy

### Unit Tests

- Each library has its own test suite
- Minimum 80% coverage for libraries
- Mock external dependencies

### Integration Tests

- Test Agent → Tools integration
- Test Bot → Agent SSE consumption
- Test complete analysis workflows

### E2E Tests

- `nx e2e agent-e2e`
- `nx e2e telegram-bot-e2e`

-----

## Summary

This architecture provides:

- ✅ Maximum code reuse via libraries
- ✅ Type safety across all services
- ✅ Independent deployment capability
- ✅ Clean separation of concerns
- ✅ Railway-optimized builds
- ✅ Streaming support via SSE
- ✅ Direct tool integration (no MCP client overhead)
- ✅ Consistent patterns across all services