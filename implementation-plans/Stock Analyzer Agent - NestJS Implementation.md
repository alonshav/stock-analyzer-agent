# Stock Analyzer Agent - NestJS Implementation

## Executive Summary

NestJS application using Anthropic’s Agent SDK with direct MCP tool integration. Streams only the LLM’s thought process (not final reports), uses a two-query approach for full analysis and executive summary, and generates PDFs via MCP tools.

## Architecture Within Nx Monorepo

### File Structure

Apps structure (thin shell):

```
apps/agent/
├── src/
│   ├── main.ts                    # NestJS bootstrap (~30 lines)
│   └── environment.ts             # Environment config
├── project.json
├── tsconfig.app.json
└── Dockerfile
```

Library structure (business logic):

```
libs/agent/
├── core/                          # Core agent logic
│   ├── src/lib/
│   │   ├── agent.module.ts
│   │   ├── agent.service.ts
│   │   ├── stream.service.ts
│   │   └── prompts/framework-v2.3.ts
│   └── project.json
│
└── api/                           # REST API + SSE
    ├── src/lib/
    │   ├── api.module.ts
    │   ├── analysis.controller.ts
    │   ├── sse.controller.ts
    │   └── dto/
    └── project.json
```

**Note**: This agent imports tools from `@stock-analyzer/mcp/tools` which is defined in the MCP plan. Tool implementations are not part of this agent plan.

### Architecture Flow

```
User/Telegram → NestJS Controller → Agent Service
                                          ↓
                                    Agent SDK query()
                                          ↓
                                    MCP Tools (direct)
                                          ↓
                                External APIs + PDF Generation
```

## Implementation Files

### 1. NestJS Bootstrap (apps/agent/src/main.ts)

```
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

  if (process.env.RAILWAY_PRIVATE_DOMAIN) {
    Logger.log(
      `Internal URL: http://${process.env.RAILWAY_PRIVATE_DOMAIN}:${port}`,
      'Bootstrap'
    );
  }
}

bootstrap();
```

### 2. Agent Module (libs/agent/core/src/lib/agent.module.ts)

```
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { StreamService } from './stream.service';
import { ApiModule } from '@stock-analyzer/agent/api';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ApiModule,
  ],
  providers: [AgentService, StreamService],
  exports: [AgentService, StreamService],
})
export class AppModule {}
```

### 3. Agent Service - Core Logic (libs/agent/core/src/lib/agent.service.ts)

```
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { STOCK_VALUATION_FRAMEWORK } from './prompts/framework-v2.3';
import { getToolsRegistry } from '@stock-analyzer/mcp/tools';

export interface AnalysisOptions {
  generatePDF?: boolean;
  focusAreas?: string[];
  peerTickers?: string[];
  investmentHorizon?: string;
}

export interface AnalysisResult {
  ticker: string;
  timestamp: string;
  fullAnalysis: string;
  executiveSummary: string;
  metadata: {
    analysisDate: string;
    framework: string;
    model: string;
    duration: number;
  };
}

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
    this.logger.log(`Starting analysis for ${ticker}`);

    // Phase 1: Full Analysis Query
    this.logger.log('Phase 1: Generating full analysis...');
    const fullAnalysis = await this.executeQuery(
      ticker,
      userPrompt,
      sessionId,
      'full-analysis'
    );

    // Phase 2: Executive Summary Query
    this.logger.log('Phase 2: Generating executive summary...');
    const summaryPrompt = `Based on the following analysis, create an executive summary:\n\n${fullAnalysis}`;

    const executiveSummary = await this.executeQuery(
      ticker,
      summaryPrompt,
      sessionId,
      'executive-summary'
    );

    const duration = Date.now() - startTime;

    const result: AnalysisResult = {
      ticker,
      timestamp: new Date().toISOString(),
      fullAnalysis,
      executiveSummary,
      metadata: {
        analysisDate: new Date().toISOString(),
        framework: 'v2.3',
        model: this.config.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514',
        duration,
      },
    };

    if (sessionId) {
      this.eventEmitter.emit(`analysis.complete.${sessionId}`, result);
    }

    this.logger.log(`Analysis complete for ${ticker} (${duration}ms)`);
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
      tools: this.tools,
    });

    for await (const message of stream) {
      if (message.type === 'assistant' && message.content) {
        const content = Array.isArray(message.content)
          ? message.content
              .map((c) => (c.type === 'text' ? c.text : ''))
              .join('')
          : message.content;

        // Only emit streaming events during thought process (full-analysis phase)
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

### 4. Stream Service (libs/agent/core/src/lib/stream.service.ts)

```
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentService, AnalysisOptions } from './agent.service';

export interface StreamSession {
  id: string;
  ticker: string;
  userId: string;
  platform: string;
  startTime: number;
  active: boolean;
}

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly sessions = new Map<string, StreamSession>();

  constructor(
    private agentService: AgentService,
    private eventEmitter: EventEmitter2
  ) {}

  async startAnalysisStream(params: {
    ticker: string;
    userPrompt: string;
    userId: string;
    sessionId: string;
    platform: string;
    options?: AnalysisOptions;
  }): Promise<string> {
    // Create unique stream ID
    const streamId = `${params.sessionId}-${Date.now()}`;

    // Create and store session metadata
    const session: StreamSession = {
      id: streamId,
      ticker: params.ticker,
      userId: params.userId,
      platform: params.platform,
      startTime: Date.now(),
      active: true,
    };
    this.sessions.set(streamId, session);
    
    this.logger.log(`Started stream: ${streamId} for ${params.ticker}`);

    // Start agent analysis (runs in background)
    // Agent will emit events that SSE controller listens to directly
    this.agentService
      .analyzeStock(
        params.ticker,
        params.userPrompt,
        params.options,
        streamId // Agent uses this in event names
      )
      .then(() => {
        this.endSession(streamId);
      })
      .catch((error) => {
        this.logger.error(`Stream error: ${error.message}`);
        this.eventEmitter.emit(`analysis.error.${streamId}`, {
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        this.endSession(streamId);
      });

    return streamId;
  }

  getSession(streamId: string): StreamSession | undefined {
    return this.sessions.get(streamId);
  }

  endSession(streamId: string): void {
    const session = this.sessions.get(streamId);
    if (session) {
      session.active = false;
      this.sessions.delete(streamId);
      this.logger.log(`Ended stream: ${streamId}`);
    }
  }

  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  getAllActiveSessions(): StreamSession[] {
    return Array.from(this.sessions.values());
  }
}
```

### 5. SSE Controller (libs/agent/api/src/lib/sse.controller.ts)

```
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
    res.setHeader('Access-Control-Allow-Origin', '*');
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

      res.write(
        `data: ${JSON.stringify({
          type: 'connected',
          streamId,
          ticker: ticker.toUpperCase(),
        })}\n\n`
      );

      // Event listeners
      const chunkListener = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', ...data })}\n\n`);
      };

      const toolListener = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'tool', ...data })}\n\n`);
      };

      const completeListener = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'complete', ...data })}\n\n`);
        res.end();
      };

      const errorListener = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'error', ...data })}\n\n`);
        res.end();
      };

      this.eventEmitter.on(`analysis.chunk.${streamId}`, chunkListener);
      this.eventEmitter.on(`analysis.tool.${streamId}`, toolListener);
      this.eventEmitter.on(`analysis.complete.${streamId}`, completeListener);
      this.eventEmitter.on(`analysis.error.${streamId}`, errorListener);

      req.on('close', () => {
        this.logger.log(`Client disconnected: ${ticker}`);
        this.eventEmitter.removeListener(`analysis.chunk.${streamId}`, chunkListener);
        this.eventEmitter.removeListener(`analysis.tool.${streamId}`, toolListener);
        this.eventEmitter.removeListener(`analysis.complete.${streamId}`, completeListener);
        this.eventEmitter.removeListener(`analysis.error.${streamId}`, errorListener);
        this.streamService.endSession(streamId);
      });
    } catch (error) {
      this.logger.error('SSE error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  }

  @Get('stream/status')
  getStreamStatus() {
    return {
      activeSessions: this.streamService.getActiveSessionsCount(),
      sessions: this.streamService.getAllActiveSessions(),
      timestamp: new Date().toISOString(),
    };
  }
}
```

### 6. Analysis Controller (libs/agent/api/src/lib/analysis.controller.ts)

```
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AgentService } from '@stock-analyzer/agent/core';
import { v4 as uuidv4 } from 'uuid';

interface AnalysisCache {
  status: 'processing' | 'complete' | 'error';
  ticker?: string;
  startTime?: number;
  result?: any;
  completionTime?: number;
  error?: string;
}

@Controller('api/analyze')
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);
  private readonly analysisCache = new Map<string, AnalysisCache>();

  constructor(private agentService: AgentService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async startAnalysis(@Body() body: {
    ticker: string;
    prompt: string;
    options?: any;
  }) {
    const analysisId = uuidv4();

    this.analysisCache.set(analysisId, {
      status: 'processing',
      ticker: body.ticker.toUpperCase(),
      startTime: Date.now(),
    });

    this.agentService
      .analyzeStock(body.ticker.toUpperCase(), body.prompt, body.options)
      .then((result) => {
        this.analysisCache.set(analysisId, {
          status: 'complete',
          result,
          completionTime: Date.now(),
        });
      })
      .catch((error) => {
        this.analysisCache.set(analysisId, {
          status: 'error',
          error: error.message,
        });
      });

    return {
      analysisId,
      status: 'processing',
      ticker: body.ticker.toUpperCase(),
    };
  }

  @Get('status/:id')
  getAnalysisStatus(@Param('id') id: string) {
    const analysis = this.analysisCache.get(id);
    if (!analysis) {
      return { error: 'Analysis not found' };
    }
    return analysis;
  }

  @Get('report/:id')
  getAnalysisReport(@Param('id') id: string) {
    const analysis = this.analysisCache.get(id);
    if (!analysis) {
      return { error: 'Analysis not found' };
    }
    if (analysis.status !== 'complete') {
      return { status: analysis.status };
    }
    return analysis.result;
  }
}
```

### 7. API Module (libs/agent/api/src/lib/api.module.ts)

```
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AnalysisController } from './analysis.controller';
import { SSEController } from './sse.controller';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
    }),
  ],
  controllers: [AnalysisController, SSEController],
})
export class ApiModule {}
```

### 8. Tool Integration

The agent imports tools from the MCP tools library and provides them to the Anthropic SDK:

```
// In agent.service.ts
import { getToolsRegistry } from '@stock-analyzer/mcp/tools';

export class AgentService {
  private readonly tools = getToolsRegistry();
  
  // Tools are passed to SDK query
  const stream = query(prompt, {
    systemPrompt: STOCK_VALUATION_FRAMEWORK,
    model: '...',
    tools: this.tools, // ← Tools provided here
  });
}
```

**Important Notes**:

- Tool implementations (`@stock-analyzer/mcp/tools`) are defined in the **MCP plan** - not part of this agent plan
- The `generate_pdf` tool will be available in the tools registry
- Framework v2.3 instructs the agent to invoke `generate_pdf` twice (full report + executive summary)
- Agent has no PDF generation logic - it only provides tools to Claude

### 9. Example Tool Implementation (libs/mcp/tools/src/lib/data-fetching/fetch-company-data.tool.ts)

```
import { Tool } from '@anthropic-ai/claude-agent-sdk';
import puppeteer from 'puppeteer';
import { marked } from 'marked';
import * as fs from 'fs/promises';
import * as path from 'path';

export const generatePDFTool: Tool = {
  name: 'generate_pdf',
  description: 'Generate a PDF report from markdown content',
  input_schema: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'Stock ticker symbol',
      },
      content: {
        type: 'string',
        description: 'Markdown content to convert',
      },
      reportType: {
        type: 'string',
        enum: ['full', 'summary'],
        description: 'Type of report',
      },
      sessionId: {
        type: 'string',
        description: 'Session ID for tracking',
      },
    },
    required: ['ticker', 'content', 'reportType'],
  },
  handler: async (params: {
    ticker: string;
    content: string;
    reportType: 'full' | 'summary';
    sessionId?: string;
  }) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${params.ticker}-${timestamp}-${params.reportType}.pdf`;
    const outputDir = process.env.PDF_STORAGE_PATH || './storage/pdfs';
    const outputPath = path.join(outputDir, filename);

    await fs.mkdir(outputDir, { recursive: true });

    const htmlContent = marked(params.content);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 2cm; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      color: #34495e;
      border-bottom: 1px solid #bdc3c7;
      padding-bottom: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #3498db;
      color: white;
    }
    .header {
      text-align: center;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${params.ticker} - ${params.reportType === 'full' ? 'Full Analysis' : 'Executive Summary'}</h1>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
  </div>
  ${htmlContent}
</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
    });
    await browser.close();

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
    const downloadUrl = `${baseUrl}/api/pdf/download/${filename}`;

    return {
      success: true,
      filename,
      outputPath,
      downloadUrl,
      reportType: params.reportType,
      ticker: params.ticker,
    };
  },
};
```

## Library Path Mappings

Configure in tsconfig.base.json:

```
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@stock-analyzer/mcp/tools": ["libs/mcp/tools/src/index.ts"],
      "@stock-analyzer/agent/core": ["libs/agent/core/src/index.ts"],
      "@stock-analyzer/agent/api": ["libs/agent/api/src/index.ts"],
      "@stock-analyzer/shared/types": ["libs/shared/types/src/index.ts"],
      "@stock-analyzer/shared/utils": ["libs/shared/utils/src/index.ts"],
      "@stock-analyzer/shared/config": ["libs/shared/config/src/index.ts"]
    }
  }
}
```

**Note**: `@stock-analyzer/mcp/tools` library is created and maintained in the MCP plan.

## Nx Commands for This Structure

```
# Generate the agent app
nx g @nx/nest:app agent

# Generate agent libraries (this plan)
nx g @nx/js:lib agent/core --directory=libs/agent/core
nx g @nx/js:lib agent/api --directory=libs/agent/api

# Note: MCP tools library is generated in the MCP plan
# nx g @nx/js:lib mcp/tools --directory=libs/mcp/tools

# Development
nx serve agent
nx test agent-core
nx build agent --configuration=production

# View dependency graph
nx graph
```

1. **NestJS Framework** - Production-ready with dependency injection
1. **Direct Tool Integration** - Tools as SDK tools, no MCP subprocess
1. **Two-Query Approach** - Separate queries for full analysis and summary
1. **Minimal Intervention** - Pass user prompts directly
1. **Stream Thought Process Only** - Only stream LLM reasoning, not reports
1. **PDF as MCP Tool** - Keeps PDFs in conversation thread
1. **EventEmitter Pattern** - Clean event-driven SSE architecture
1. **No CLI** - Web API only

## Streaming Behavior

✅ Stream: LLM thought process, tool usage, phase transitions, data gathering

❌ Don’t Stream: Final reports (saved to variables), PDFs (via tool, returned as links)

## Environment Variables

```
NODE_ENV=production
PORT=3001
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=16000
ANTHROPIC_MAX_TURNS=20
FMP_API_KEY=...
ALPHA_VANTAGE_KEY=...
SEC_EDGAR_EMAIL=contact@example.com
PDF_STORAGE_PATH=/app/storage/pdfs
PUBLIC_URL=https://agent.railway.app
REDIS_URL=redis://...
```

## Railway Deployment

```
{
  "scripts": {
    "build:agent": "nx build agent --configuration=production",
    "start:agent": "node dist/apps/agent/main.js"
  }
}
```

Railway Configuration:

- Build Command: npm run build:agent
- Start Command: npm run start:agent
- Health Check: /health
- Port: 3001