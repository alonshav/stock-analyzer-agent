# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock Analyzer is an Nx monorepo for AI-powered financial analysis with three applications:

- **Agent**: NestJS service orchestrating LLM-based stock analysis using Anthropic SDK
- **Telegram Bot**: User interface streaming analysis results via SSE
- **MCP Server**: Standalone Model Context Protocol server exposing financial tools via stdio

**Critical Architecture Decision**: The Agent uses Anthropic SDK with **direct tool imports** from `@stock-analyzer/mcp/tools` (NOT MCP client protocol). The MCP Server is a separate standalone service for external MCP clients (like Claude Desktop).

## Architecture Flow

```
┌─────────────────────────────────────────────────┐
│ User → Telegram Bot → Agent (SSE streaming)     │
│                          ↓                      │
│                    Anthropic SDK                │
│                          ↓                      │
│              Direct imports from mcp/tools      │
│                          ↓                      │
│          FMP API, Alpha Vantage, Anvil API      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ External MCP Clients (Claude Desktop, etc.)     │
│                          ↓                      │
│                  MCP Server (stdio)             │
│                          ↓                      │
│                     mcp/tools                   │
│                          ↓                      │
│          FMP API, Alpha Vantage, etc.           │
└─────────────────────────────────────────────────┘
```

### Key Architectural Principles

1. **Apps are thin shells** (~50-100 lines) - all business logic lives in libraries
2. **Agent imports tools directly** from `@stock-analyzer/mcp/tools` via `createToolRegistry()`
3. **MCP Server is standalone** - runs independently for external MCP clients
4. **Tools are dual-use** - same implementations used by both Agent (direct) and MCP Server (stdio)
5. **SSE streams analysis process** - real-time text chunks and tool usage events
6. **Single-query approach** - generates executive summary directly (optimized for speed)
7. **Extended thinking enabled** - uses `maxThinkingTokens: 10000` for deeper analysis
8. **External PDF generation** - via Anvil API (no Puppeteer)
9. **Tool response optimization** - Data fetch limited to stay under Claude's 25K token tool response limit
10. **Session management** - 1-hour conversational memory enables follow-up questions
11. **Hooks system** - Middleware-style interception for validation, budget control, and data filtering
12. **Two operating modes** - Workflow (new analysis) and Conversation (follow-ups with context)

## Repository Structure

```
apps/                        # Thin bootstraps only
  ├── agent/                # NestJS app (port 3001)
  ├── telegram-bot/         # NestJS app (port 3002)
  └── mcp-server/           # Standalone MCP stdio server
libs/                        # All business logic
  ├── mcp/
  │   ├── tools/           # Tool implementations (dual-use)
  │   │   ├── tool-registry.ts      # ToolRegistry class + createToolRegistry()
  │   │   ├── dcf/                  # DCF calculator
  │   │   └── data-fetching/        # CompanyDataFetcher
  │   ├── server/          # MCP server implementation (StdioServerTransport)
  │   └── integrations/    # External API adapters (FMPAdapter)
  ├── agent/
  │   ├── core/           # AgentService, StreamService
  │   ├── api/            # REST + SSE controllers
  │   ├── session/        # SessionManagerService (1-hour memory)
  │   └── hooks/          # HooksService (validation, budget, filtering)
  ├── bot/
  │   ├── telegram/       # Telegram bot implementation
  │   └── common/         # Shared bot utilities
  └── shared/
      ├── types/          # CompanyProfile, Quote, FinancialStatements
      ├── utils/          # CacheManager, RateLimiter
      ├── config/         # Configuration modules
      └── schemas/        # Validation schemas
```

## Development Commands

```bash
# Quick Start (build + run both services)
npm run start:all           # Build agent + telegram-bot, then run both

# Development (all services in parallel)
npm run dev

# Individual services
nx serve agent              # Port 3001
nx serve telegram-bot       # Port 3002
nx serve mcp-server         # Stdio mode

# Build
npm run build:agent
npm run build:telegram-bot
npm run build:mcp-server
nx build <library-name>     # Build specific library

# Build all projects
nx run-many --target=build --all

# Production start
npm run start:agent         # Start agent only
npm run start:telegram-bot  # Start Telegram bot only
npm run start:mcp-server    # Start MCP server only

# Testing
npm run test                # All tests
nx test <project-name>      # Specific project
nx test agent-core          # Example: test agent core library
nx affected --target=test   # Only affected by changes

# Linting
npm run lint
nx lint <project-name>
nx affected --target=lint

# Dependency graph
nx graph
```

## Nx CLI Usage Guidelines

**CRITICAL**: Always use Nx CLI commands to generate files and libraries:

```bash
# Generate new library
nx g @nx/js:library my-lib --directory=libs/shared/my-lib --no-interactive

# Generate new NestJS app
nx g @nx/nest:application my-app --directory=apps/my-app --no-interactive

# Generate new NestJS library
nx g @nx/nest:library my-lib --directory=libs/my-lib --no-interactive

# Always use --no-interactive flag to avoid prompts
```

**Never manually create project.json, tsconfig files, or library scaffolding** - let Nx generators handle it.

## Library Dependencies

**Critical**: Agent depends on `@stock-analyzer/mcp/tools` but NOT `@stock-analyzer/mcp/server`.

```
shared/types → shared/utils → shared/config
       ↓              ↓
   mcp/integrations (FMPAdapter)
       ↓
   mcp/tools (ToolRegistry, DCFCalculator, CompanyDataFetcher)
       ↓              ↓                    ↓
   mcp/server    agent/session       agent/hooks
       ↓              ↓                    ↓
   mcp-server    agent/core (AgentService imports all three)
     (app)            ↓
                 agent/api (REST + SSE controllers)
                      ↓
                 bot/telegram (StreamManagerService, TelegramBotService)
                      ↓
                telegram-bot (app)
```

## TypeScript Path Mappings

All libraries are accessible via `@stock-analyzer/` namespace:

- `@stock-analyzer/mcp/tools` - Tool implementations (**imported directly by Agent**)
- `@stock-analyzer/mcp/server` - MCP server class (NOT used by Agent)
- `@stock-analyzer/mcp/integrations` - FMP API adapter
- `@stock-analyzer/agent/core` - Agent service logic
- `@stock-analyzer/agent/api` - REST/SSE controllers
- `@stock-analyzer/agent/session` - Session management (NEW - 1-hour conversational memory)
- `@stock-analyzer/agent/hooks` - Hooks system (NEW - validation, budget, filtering)
- `@stock-analyzer/bot/telegram` - Telegram bot implementation
- `@stock-analyzer/bot/common` - Shared bot utilities
- `@stock-analyzer/shared/types` - Financial data types
- `@stock-analyzer/shared/utils` - CacheManager, RateLimiter
- `@stock-analyzer/shared/config` - Configuration modules
- `@stock-analyzer/shared/schemas` - Validation schemas

## Tool Registry Pattern (Dual-Use)

The `ToolRegistry` in `libs/mcp/tools/src/lib/tool-registry.ts` is designed for dual use:

```typescript
import { createToolRegistry } from '@stock-analyzer/mcp/tools';

// 1. For Agent (direct tool access via Anthropic SDK)
const registry = createToolRegistry();
const tools = registry.getTools(); // Returns Tool[] for Anthropic SDK

// 2. For MCP Server (stdio protocol)
const registry = createToolRegistry();
// Used internally by StockAnalysisMCPServer

// Tools available:
// - fetch_company_data: Get financial data from FMP API
// - calculate_dcf: Perform DCF valuation
// - test_api_connection: Test FMP API connectivity
```

## Agent Implementation Pattern

```typescript
// libs/agent/core/src/lib/agent.service.ts
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { createToolRegistry } from '@stock-analyzer/mcp/tools';

export class AgentService {
  private mcpServer;

  async onModuleInit() {
    const registry = createToolRegistry();
    const mcpTools = registry.getTools();

    // Convert MCP tools to SDK tools
    const sdkTools = mcpTools.map((mcpTool) =>
      tool(mcpTool.name, mcpTool.description, zodSchema, async (args) => {
        return await registry.executeTool(mcpTool.name, args);
      })
    );

    // Create SDK MCP server
    this.mcpServer = createSdkMcpServer({
      name: 'stock-analyzer-tools',
      version: '1.0.0',
      tools: sdkTools,
    });
  }

  async analyzeStock(ticker: string, userPrompt: string, sessionId?: string) {
    const stream = query({
      prompt: userPrompt,
      options: {
        systemPrompt: STOCK_VALUATION_FRAMEWORK,
        model: 'claude-sonnet-4-20250514',
        maxTurns: 20,
        maxThinkingTokens: 10000,
        permissionMode: 'bypassPermissions',
        mcpServers: {
          'stock-analyzer': this.mcpServer,
        },
      },
    });

    // Process stream and emit events...
  }
}
```

## Session Management & Conversation Mode

The system maintains 1-hour conversational sessions enabling follow-up questions:

**Session Lifecycle** (`libs/agent/session/src/lib/session-manager.service.ts`):
```typescript
// Sessions automatically created on analysis start
const session = sessionManager.createSession(chatId, ticker);
// Session: { sessionId, ticker, chatId, status: 'active', expiresAt: now + 1hr }

// Conversation history tracked for context
sessionManager.addMessage(chatId, 'user', 'What is the P/E ratio?');
sessionManager.addMessage(chatId, 'assistant', 'AAPL has P/E of 28.5...');

// Context building for follow-up questions
const contextPrompt = sessionManager.buildContextPrompt(chatId, newMessage);
// Includes: ticker, recent analysis summary, conversation history, current question

// Automatic cleanup every 5 minutes removes expired sessions
```

**Two Operating Modes**:

1. **Workflow Mode** - `analyzeStock(chatId, ticker, prompt)`:
   - Creates new session
   - Runs full analysis (30-60s)
   - Streams executive summary
   - Session remains active for follow-ups

2. **Conversation Mode** - `handleConversation(chatId, message)`:
   - Loads active session
   - Builds context from past analysis + conversation
   - Calls Claude with full context (5-15s)
   - Streams targeted answer
   - Adds Q&A to conversation history

**Backward Compatibility**: Legacy `analyzeStock(ticker, prompt)` signature still works via overload detection.

## Hooks System (Middleware Pattern)

Three hook types intercept the analysis lifecycle (`libs/agent/hooks/src/lib/hooks.service.ts`):

**1. OnMessageHook** - Fires for every SDK message:
```typescript
const hook = hooksService.createOnMessageHook(sessionId, chatId);
// Tracks: token usage, message types, progress events
// Use case: Monitoring and metrics
```

**2. OnToolUseHook** - Fires BEFORE tool execution:
```typescript
const hook = hooksService.createOnToolUseHook(sessionId, chatId);
// Validates: required parameters, budget limits
// Injects: session context, ticker context
// Use case: Budget control, input validation
```

**3. OnToolResultHook** - Fires AFTER tool execution:
```typescript
const hook = hooksService.createOnToolResultHook(sessionId, chatId);
// Filters: sensitive data (apiKey, password, token)
// Enhances: error messages with session context
// Caches: tool results for reuse
// Use case: Security, error handling, optimization
```

**SDK Integration** - Hooks connect via Anthropic SDK's PreToolUse/PostToolUse events in `agent.service.ts:executeQuery()`.

**Error Resilience** - Hook failures are logged but don't block analysis (graceful degradation).

## MCP Server Standalone Usage

The MCP Server can be run as a standalone service for external MCP clients (Claude Desktop, Cursor, etc.):

```bash
# Build and run locally
npm run build:mcp-server
npm run start:mcp-server

# Or via npx from GitHub (recommended for external users)
npx -y github:alonshav/stock-analyzer-agent

# Requires environment variable
export FMP_API_KEY=your-api-key
```

**MCP Client Configuration (Claude Desktop, Cursor, etc.):**
```json
{
  "mcpServers": {
    "stock-analyzer": {
      "command": "npx",
      "args": ["-y", "github:alonshav/stock-analyzer-agent"],
      "env": {
        "FMP_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Critical Implementation Details:**
- Package name is `stock-analyzer-mcp` (NOT `@stock-analyzer/source`) to avoid shell conflicts
- `dist/apps/mcp-server` is committed to git for npx from GitHub
- `files` field in package.json includes only `dist/apps/mcp-server`
- API key validation is lazy (checked on tool execution, not server startup)
- Shebang `#!/usr/bin/env node` enables direct execution

## SSE Streaming Pattern

The agent streams analysis in real-time via Server-Sent Events (SSE):

```typescript
// Agent emits events during analysis (libs/agent/core/src/lib/agent.service.ts)
// Event emission happens in executeQuery() method, NOT in tool() wrapper

// Text chunks from LLM response
this.eventEmitter.emit(`analysis.chunk.${sessionId}`, {
  ticker,
  type: 'text',
  content: textContent,
  phase: 'executive-summary',
  timestamp: new Date().toISOString(),
});

// Thinking indicators
this.eventEmitter.emit(`analysis.thinking.${sessionId}`, {
  ticker,
  type: 'thinking',
  message: 'Analyzing data...',
  timestamp: new Date().toISOString(),
});

// Tool usage notifications
this.eventEmitter.emit(`analysis.tool.${sessionId}`, {
  ticker,
  toolName: 'mcp__stock-analyzer__fetch_company_data',
  toolId: 'toolu_xxx',
  timestamp: new Date().toISOString(),
});

// PDF generation results (emitted after processing tool results)
this.eventEmitter.emit(`analysis.pdf.${sessionId}`, {
  ticker,
  pdfBase64: '...',  // Base64-encoded PDF binary
  fileSize: 21590,
  reportType: 'summary' | 'full',
  timestamp: new Date().toISOString(),
});

// Analysis complete
this.eventEmitter.emit(`analysis.complete.${sessionId}`, {
  ticker,
  metadata: { analysisDate, framework, model, duration },
  // executiveSummary omitted (already streamed as chunks)
});

// SSE Controller forwards to client (libs/agent/api/src/lib/sse.controller.ts)
res.write(`data: ${JSON.stringify({
  type: 'connected' | 'chunk' | 'thinking' | 'tool' | 'pdf' | 'complete' | 'error',
  ...eventData
})}\n\n`);
```

**Event Flow:**
1. `connected` - Stream established (streamId, ticker)
2. `thinking` - Agent is thinking (shows typing indicator in Telegram)
3. `chunk` - Text content from LLM (incremental response text)
4. `tool` - Tool called (toolName with mcp__ prefix, toolId)
5. `pdf` - PDF generated (pdfBase64, fileSize, reportType)
6. `complete` - Analysis finished (metadata only, no summary duplication)
7. `error` - Error occurred (message, timestamp)

**Critical Implementation Details:**
- PDF emission happens in `executeQuery()` when processing `user` messages containing tool results
- Tool names are prefixed with `mcp__stock-analyzer__` by the SDK
- PDF data is transmitted as base64-encoded binary in SSE stream
- Telegram bot decodes base64 and sends PDF as document via `sendDocument()`
- Tool() wrapper functions must remain simple - NO event emission in tool execution

## Environment Variables

### Agent (Port 3001)
```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
FMP_API_KEY=...              # Financial Modeling Prep
ALPHA_VANTAGE_KEY=...        # Market data
ANVIL_API_KEY=...            # PDF generation
```

### Telegram Bot (Port 3002)
```bash
TELEGRAM_BOT_TOKEN=...
AGENT_SERVICE_URL=http://localhost:3001
```

### MCP Server (Standalone)
```bash
FMP_API_KEY=...              # Required for FMP API access
```

## Caching & Rate Limiting

- **CacheManager** (`libs/shared/utils/src/lib/cache.ts`)
  - Uses `node-cache` library
  - Configurable TTL per data type (profile: 24h, quote: 1m, financials: 1h)
  - Key generation: `{TICKER}:{dataType}:{params}`

- **RateLimiter** (`libs/shared/utils/src/lib/rate-limiter.ts`)
  - Token bucket algorithm
  - Per-identifier rate limiting
  - Configurable tokens per second and bucket size

Both are instantiated by `createToolRegistry()` and shared across tools.

## Stock Valuation Framework v2.3

Located in `libs/agent/core/src/lib/prompts/framework-v2.3.ts`:

**Framework Philosophy:**
- Systematic 6-phase approach for valuing growth companies transitioning from revenue multiples to earnings-based valuations
- De-risks investment decisions by quantifying "multiple compression" risk
- Comprehensive quality assessment across 6 dimensions (0-18 scale)

**Critical Framework Instructions:**
- **Single tool call**: Instructs LLM to call `fetch_company_data` ONLY ONCE per analysis
- **Quarterly data**: Use `period="quarter"` and `limit=8` (last 2 years of quarterly data)
- **Forbidden tools**: Explicitly forbids using non-financial tools (TodoWrite, Read, Write, Bash, etc.)
- **Available tools**: Only `fetch_company_data`, `calculate_dcf`, `test_api_connection`

**Six-Phase Analysis Process:**
1. Setup & Preparation (20min)
2. Data Collection & Verification (15min)
3. Core Analysis (30min)
4. Valuation Testing (20min)
5. Quality & Risk Assessment (15min)
6. Decision & Implementation (10min)

**Three Critical Handoff Tests:**
1. Implied P/E Analysis - Risk if >50x for scaled company
2. Required Margin Analysis - Risk if exceeds best-in-class peers
3. Scale Requirements - Express as multiple of current revenue

## Key Financial Data Types

Located in `libs/shared/types/src/lib/company.types.ts`:

- `CompanyProfile` - Company metadata, industry, sector, market cap
- `Quote` - Current price, volume, day change
- `IncomeStatement` - Revenue, expenses, net income
- `BalanceSheet` - Assets, liabilities, equity
- `CashFlowStatement` - Operating, investing, financing activities
- `KeyMetrics` - P/E, ROE, ROA, debt ratios
- `FinancialRatios` - Liquidity, profitability, solvency ratios
- `CompanyData` - Aggregates all financial data types

## Build Configuration

- **Agent & Telegram Bot**: Use `@nx/webpack` with NestJS
- **MCP Server**: Uses `@nx/esbuild` with:
  - `bundle: false` (preserves library structure for internal imports)
  - `format: cjs` (CommonJS for Node.js compatibility)
  - `banner: { js: "#!/usr/bin/env node" }` (adds shebang for direct execution)
  - `generatePackageJson: true` (creates standalone package.json)
  - Build script includes `chmod +x` for executable permissions

**Important**: When modifying MCP server code, rebuild and commit the dist folder:
```bash
npm run build:mcp-server
git add dist/apps/mcp-server
git commit -m "Update MCP server build"
```

## Testing Strategy

- Unit tests for pure functions (DCF calculator, utility functions)
- Integration tests for API adapters (mocked HTTP calls)
- E2E tests for full analysis flows (in `libs/e2e/`)
- Use `nx affected --target=test` to run only affected tests

## Railway Deployment

Two services deployed separately:
- **telegram-bot** (public, port 3002) - exposed to internet for Telegram webhooks
- **agent** (internal, port 3001) - private service, accessed only by telegram-bot

MCP Server is NOT deployed (tools are bundled directly with Agent).

```bash
# Railway build commands
npm run build:telegram-bot
npm run build:agent

# Railway start commands
npm run start:telegram-bot
npm run start:agent
```

## Common Patterns

### Adding a New Tool

1. Create tool implementation in `libs/mcp/tools/src/lib/my-tool/`
2. Export from `libs/mcp/tools/src/index.ts`
3. Register in `ToolRegistry.getTools()` with MCP Tool schema
4. Add handler method in `ToolRegistry.executeTool()`
5. Rebuild and commit MCP server: `npm run build:mcp-server && git add dist/apps/mcp-server`
6. Tool is now available to both Agent and MCP Server

**Critical**: API dependencies should use lazy initialization (like `CompanyDataFetcher.ensureAdapter()`) to allow MCP server to start without API keys and validate them only when tools are called.

### Adding a New API Integration

1. Use Nx generator: `nx g @nx/js:library my-api --directory=libs/mcp/integrations --no-interactive`
2. Create adapter class in `libs/mcp/integrations/src/lib/my-api/`
3. Use `CacheManager` and `RateLimiter` from `@stock-analyzer/shared/utils`
4. Export adapter from library index

### Streaming Analysis from Agent

**Analysis Flow (Single-Query Approach):**
1. Agent calls `analyzeStock(ticker, userPrompt, options, sessionId)`
2. Executes single query with `phase: 'executive-summary'`
3. Anthropic SDK streams with extended thinking (`maxThinkingTokens: 10000`)
4. Agent processes stream messages:
   - Text content → emits `analysis.chunk.${sessionId}`
   - Tool use → emits `analysis.tool.${sessionId}` (toolName, toolId)
   - Stream complete → emits `analysis.complete.${sessionId}`
5. SSE controller listens for events and forwards to client as SSE
6. Client receives real-time updates: connected → chunks → tool calls → complete

**Key Optimizations:**
- Single query (executive summary only) instead of two-phase analysis
- Framework instructs LLM to call `fetch_company_data` ONLY ONCE with quarterly data (8 quarters)
- Extended thinking enabled for deeper analysis without multiple turns
- Tool event emission for real-time visibility into data fetching
- `fullAnalysis` field is optional (empty by default)

## Telegram Bot Integration

**Smart Routing** (`libs/bot/telegram/src/lib/telegram-bot.service.ts`):

The bot intelligently routes user input based on context:
```typescript
// Command handling
/analyze TICKER → handleAnalyzeCommand()
/status         → handleStatusCommand()  (NEW - shows session info)
/stop           → handleStopCommand()
/help           → handleHelpCommand()

// Smart text routing
"AAPL"                    → Start new analysis (if no active session)
"AAPL" (session active)   → Conflict detection: "Start new or continue?"
"What's the P/E ratio?"   → Route to conversation mode (if session active)
"What's the P/E ratio?"   → Error: "No active session" (if no session)
```

**Event Streaming** (`libs/bot/telegram/src/lib/stream-manager.service.ts`):

Connects to Agent's SSE endpoint and handles real-time events:
- `connected` → Establish stream
- `thinking` → Send typing action (`ctx.sendChatAction('typing')`)
- `chunk` → Update message with streaming text (throttled: 1s or 10 chunks)
- `tool` → Show tool usage notification
- `pdf` → Decode base64, send as document via `ctx.telegram.sendDocument()`
- `complete` → Display final summary + prompt for follow-up questions

**Session Tracking**:
- `startStream()` → Tracks session for analysis
- `startConversation()` → Handles follow-up questions
- `hasActiveSession()` → Checks if user has active session
- `getSessionStatus()` → Returns session info for `/status` command

**Critical Implementation Details:**
- **No Markdown parse mode** - Messages sent as plain text to avoid parsing errors
- **Message throttling** - Updates every 1 second OR every 10 chunks to avoid rate limits
- **Buffer management** - Maintains stream buffer per chat ID, truncates at 3500 chars
- **Error handling** - Gracefully handles edit failures, creates new messages if needed
- **PDF transmission** - Converts base64 → Buffer → Telegram document with caption
- **Cleanup** - Closes EventSource and clears buffers on completion/error

**Environment:**
```bash
TELEGRAM_BOT_TOKEN=...              # Bot token from @BotFather
AGENT_SERVICE_URL=http://localhost:3001  # Agent API endpoint
TELEGRAM_BOT_PORT=3002              # Bot webhook port
```

## PDF Generation via Anvil API

PDF generation (`libs/mcp/tools/src/lib/pdf/generate-pdf-tool.ts`) uses Anvil's REST API:

**Implementation:**
- **Provider**: Anvil PDF API (https://www.useanvil.com)
- **Pricing**: Free tier 500 PDFs/month, then $0.10/PDF
- **Input**: Markdown content, ticker, reportType ('full' | 'summary')
- **Output**: Base64-encoded PDF binary + file size + provider name

**API Request Format:**
```typescript
{
  title: "AAPL - Executive Summary",
  type: "markdown",
  data: [
    {
      heading: "AAPL - Executive Summary",
      content: "*Generated: 1/9/2025*",
      fontSize: 10,
      textColor: "#6B7280"
    },
    {
      content: "# Analysis content in markdown..."
    }
  ]
}
```

**Response Handling:**
- Anvil returns PDF binary directly (NOT JSON with download URL)
- Convert binary response to base64: `Buffer.from(arrayBuffer).toString('base64')`
- Return structured result with success flag, pdfBase64, fileSize, reportType

**Critical**: PDF events are emitted in `agent.service.ts:executeQuery()` when processing tool result messages, NOT in the tool() wrapper function.

## Code Style Conventions

**Always follow these conventions:**
- **Kill servers** after finishing debugging/testing/coding with a process
- **Private methods** at the end of TypeScript files
- **Public methods** after the constructor
- **Properties** before the constructor
- **Tool() wrappers** must remain simple - execute tool and return result only, NO side effects or event emission