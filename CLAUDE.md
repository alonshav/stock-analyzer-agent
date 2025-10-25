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
10. **Agent is stateless** - Bot owns all session state, conversation history, and workflow tracking
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
       ↓              ↓
   mcp/server    agent/hooks
       ↓              ↓
   mcp-server    agent/core (AgentService - stateless)
     (app)            ↓
                 agent/api (REST + SSE controllers)
                      ↓
                 bot/sessions (SessionOrchestrator - owns all sessions)
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
- `@stock-analyzer/agent/core` - Agent service logic (stateless)
- `@stock-analyzer/agent/api` - REST/SSE controllers
- `@stock-analyzer/agent/hooks` - Hooks system (validation, budget, filtering)
- `@stock-analyzer/bot/sessions` - Session management (SessionOrchestrator)
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

// Tools available (January 2025 - Updated):
// - fetch_company_data: Get financial data from FMP API
// - calculate_dcf: Perform DCF valuation
// - fetch_sentiment_data: Get news sentiment, social sentiment, analyst grades
// - fetch_news: Get recent news articles for ticker
// - generate_pdf: Generate PDF reports via Anvil API
// - test_api_connection: Test FMP API connectivity
```

## Workflow Types & Commands

Located in `libs/agent/core/src/lib/workflows/workflow-registry.ts`:

**Available Workflows** (January 2025 - Complete):

| Workflow | Bot Command | Duration | Tools | Description |
|----------|-------------|----------|-------|-------------|
| `FULL_ANALYSIS` | `/analyze TICKER` | 2-3 min | fetch_company_data, calculate_dcf | Comprehensive 6-phase stock valuation |
| `SENTIMENT` | `/sentiment TICKER` | 1-2 min | fetch_company_data, fetch_sentiment_data | Market sentiment analysis (news + social) |
| `NEWS` | `/news TICKER` | 1-2 min | fetch_company_data, fetch_news, fetch_sentiment_data | Recent news impact analysis |
| `EARNINGS` | `/earnings TICKER [Q]` | 2-3 min | fetch_company_data | Quarterly earnings analysis |
| `DCF_VALUATION` | N/A | 2-3 min | fetch_company_data, calculate_dcf | Deep-dive DCF valuation |
| `PEER_COMPARISON` | N/A | 2-3 min | fetch_company_data | Comparative industry analysis |

**Additional Commands:**
- `/earnings_summary TICKER` - Quick earnings snapshot (text-only, 30s)
- `/disclaimer` - Show financial disclaimer
- `/status` - View active session info
- `/new` or `/reset` - Start fresh session
- `/help` - Show all commands

**Workflow System Prompts:**
All workflow-specific prompts are extracted to `libs/agent/core/src/lib/workflows/prompts.ts` for maintainability. The `BASE_SYSTEM_PROMPT` is prepended to all workflows automatically.

## FMP API Integration & Sentiment Data

**New Tools (January 2025):**

### fetch_sentiment_data
Located in `libs/mcp/tools/src/lib/sentiment/sentiment-data-fetcher.ts`

Aggregates sentiment data from multiple FMP API endpoints:
- **News Sentiment** (`/v4/stock-news-sentiments-rss-feed`) - News with sentiment scores (positive/negative/neutral)
- **Social Sentiment** (`/v4/historical/social-sentiment`) - StockTwits + Twitter metrics
- **Sentiment Changes** (`/v4/social-sentiments/change`) - Sentiment momentum tracking
- **Stock Grades** (`/v3/grade/`) - Analyst rating changes

**Caching Strategy:**
- News sentiment: 1 hour TTL
- Social sentiment: 30 min TTL
- Stock grades: 24 hours TTL

### fetch_news
Located in `libs/mcp/tools/src/lib/news/news-data-fetcher.ts`

Fetches recent news articles from FMP API (`/v3/stock_news`):
- Returns up to 20 recent articles
- 30-minute cache TTL
- Fields: title, publishedDate, url, text, site, image

**Type Definitions:**
All sentiment types defined in `libs/shared/types/src/lib/sentiment.types.ts`:
- `NewsSentiment` - News with sentiment scores
- `SocialSentiment` - Social media metrics (StockTwits, Twitter)
- `SentimentChange` - Sentiment change over time
- `StockGrade` - Analyst rating changes
- `StockNews` - General news articles

**Note:** Reddit data is NOT available in FMP API (fields marked optional in `SocialSentiment`).

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

**Critical Architecture Decision**: The **Bot owns all session state**. The Agent is stateless.

**Session Ownership** (`libs/bot/sessions/src/lib/session-store/session-orchestrator.service.ts`):
- Bot's `SessionOrchestrator` manages all chat sessions
- Stores conversation history, workflow executions, and session state
- Agent receives `sessionId` from bot but doesn't manage sessions itself
- Agent processes requests and returns results - no state retention

**Session Lifecycle States**:
```typescript
export enum SessionStatus {
  ACTIVE = 'active',   // Session is active and available
  STOPPED = 'stopped', // User ended session via /new or /reset
}

// State transitions:
ACTIVE → (user /new or /stop) → STOPPED
```

**SessionOrchestrator Methods** (`libs/bot/sessions/`):
```typescript
// Get or create session
const session = sessionOrchestrator.getOrCreateSession(chatId);

// Track workflow execution
const workflowId = sessionOrchestrator.trackWorkflow(chatId, WorkflowType.FULL_ANALYSIS, ticker);

// Complete workflow and add to conversation history
sessionOrchestrator.completeWorkflow(chatId, workflowId, analysisResult);

// Add messages to conversation history
sessionOrchestrator.addMessage(chatId, MessageRole.USER, 'What is the P/E?');
sessionOrchestrator.addMessage(chatId, MessageRole.ASSISTANT, 'P/E is 28.5...');

// Get full conversation history for follow-ups
const history = sessionOrchestrator.getConversationHistory(chatId);

// Stop session (user command)
sessionOrchestrator.stopSession(chatId, 'User started new session');
```

**Key Design Decisions**:
1. **Agent is stateless** - receives sessionId, processes request, returns result
2. **Bot owns sessions** - manages conversation history and workflow tracking
3. **Simple state machine** - ACTIVE ↔ STOPPED (no complex lifecycle)
4. **Multiple workflows per session** - users can analyze multiple stocks in one chat session
5. **7-day cleanup** - STOPPED sessions removed after 7 days of inactivity

**Two Operating Modes**:

1. **Workflow Mode** - Bot calls `/api/workflow`:
   - Bot creates/retrieves session
   - Bot tracks workflow in session
   - Agent executes analysis (stateless)
   - Bot receives SSE stream
   - Bot completes workflow in session with result

2. **Conversation Mode** - Bot calls `/api/conversation`:
   - Bot retrieves session and conversation history
   - Bot sends history to Agent
   - Agent processes question with context (stateless)
   - Bot receives SSE stream
   - Bot adds Q&A to conversation history

**Real-World Flow**:
```
User: /analyze AAPL
  → Bot: getOrCreateSession(chatId)
  → Bot: trackWorkflow(chatId, FULL_ANALYSIS, 'AAPL')
  → Agent: executeWorkflow(sessionId, ...) [stateless]
  → Bot: completeWorkflow(chatId, workflowId, result)

User: "What's the P/E?"
  → Bot: getConversationHistory(chatId)
  → Agent: executeConversation(sessionId, message, history) [stateless]
  → Bot: addMessage(chatId, USER, question)
  → Bot: addMessage(chatId, ASSISTANT, answer)

User: /new
  → Bot: stopSession(chatId, 'User started fresh')
  → Bot: getOrCreateSession(chatId) [creates new one]
```

**Message Tracking**: All bot messages are tracked via `BotMessagingService`, which calls `SessionOrchestrator.addMessage()` automatically.

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

## Stream Event Architecture

**Centralized Event Type System** (`libs/shared/types/src/lib/enums.ts`):

All SSE events use the `StreamEventType` enum for type safety:

```typescript
export enum StreamEventType {
  CONNECTED = 'connected',      // Stream established
  CHUNK = 'chunk',              // Text content from LLM
  THINKING = 'thinking',        // Extended thinking indicator
  TOOL = 'tool',                // Tool called
  TOOL_RESULT = 'tool_result',  // Tool execution completed
  PDF = 'pdf',                  // PDF generated
  RESULT = 'result',            // Final conversation result
  SYSTEM = 'system',            // System initialization
  COMPACTION = 'compaction',    // Context compaction
  PARTIAL = 'partial',          // Partial streaming chunks
  COMPLETE = 'complete',        // Analysis complete
  ERROR = 'error',              // Error occurred
}

// Event naming helper
const eventName = createEventName(StreamEventType.CHUNK, sessionId);
// Returns: "analysis.chunk.{sessionId}"
```

**Tool Name Matching**:

The `isToolName()` helper handles both plain and MCP-prefixed tool names:

```typescript
import { isToolName, ToolName } from '@stock-analyzer/shared/types';

// Helper function handles both plain and MCP-prefixed names
isToolName('mcp__stock-analyzer__fetch_company_data', ToolName.FETCH_COMPANY_DATA) // true
isToolName('fetch_company_data', ToolName.FETCH_COMPANY_DATA) // true
```

**Tool Names Enum** (January 2025 - Updated):

```typescript
export enum ToolName {
  FETCH_COMPANY_DATA = 'fetch_company_data',
  CALCULATE_DCF = 'calculate_dcf',
  GENERATE_PDF = 'generate_pdf',
  TEST_API_CONNECTION = 'test_api_connection',
  FETCH_SENTIMENT_DATA = 'fetch_sentiment_data',  // NEW
  FETCH_NEWS = 'fetch_news',                      // NEW
}

// MCP-prefixed versions (as they appear in Agent SDK)
export const MCPToolName = {
  FETCH_COMPANY_DATA: 'mcp__stock-analyzer__fetch_company_data',
  CALCULATE_DCF: 'mcp__stock-analyzer__calculate_dcf',
  GENERATE_PDF: 'mcp__stock-analyzer__generate_pdf',
  TEST_API_CONNECTION: 'mcp__stock-analyzer__test_api_connection',
  FETCH_SENTIMENT_DATA: 'mcp__stock-analyzer__fetch_sentiment_data',  // NEW
  FETCH_NEWS: 'mcp__stock-analyzer__fetch_news',                      // NEW
} as const;
```

## Environment Variables

### Agent (Port 3001)
```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5
FMP_API_KEY=...              # Financial Modeling Prep
ALPHA_VANTAGE_KEY=...        # Market data
ANVIL_API_KEY=...            # PDF generation
```

### Telegram Bot (Port 3002)

**Development (Local):**
```bash
NODE_ENV=development
TELEGRAM_BOT_TOKEN=...       # DEV bot token (from .env file)
AGENT_SERVICE_URL=http://localhost:3001
```

**Production (Railway):**
```bash
NODE_ENV=production
TELEGRAM_BOT_TOKEN=...       # PROD bot token (set in Railway dashboard)
AGENT_SERVICE_URL=...        # Railway internal URL for agent service
```

**Bot Environment Indicators:**
- Development bot shows **🔧 [DEV]** badge in responses (when `NODE_ENV=development`)
- Production bot shows no badge
- See `DEV_VS_PROD.md` for detailed setup instructions

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

### Company & Financial Data
Located in `libs/shared/types/src/lib/company.types.ts`:

- `CompanyProfile` - Company metadata, industry, sector, market cap
- `Quote` - Current price, volume, day change
- `IncomeStatement` - Revenue, expenses, net income
- `BalanceSheet` - Assets, liabilities, equity
- `CashFlowStatement` - Operating, investing, financing activities
- `KeyMetrics` - P/E, ROE, ROA, debt ratios
- `FinancialRatios` - Liquidity, profitability, solvency ratios
- `CompanyData` - Aggregates all financial data types

### Sentiment Data (January 2025 - New)
Located in `libs/shared/types/src/lib/sentiment.types.ts`:

- `NewsSentiment` - News with sentiment scores (positive/negative/neutral)
- `SocialSentiment` - Social media metrics (StockTwits, Twitter)
- `SentimentChange` - Sentiment change over time for momentum tracking
- `StockGrade` - Analyst rating changes (e.g., Buy → Hold)
- `StockNews` - General news articles (no sentiment scores)

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

### Railway CLI - Debugging Production Issues

The Railway CLI allows you to view live logs and debug production deployments directly from your terminal.

**Installation:**
```bash
# Install via Homebrew (macOS/Linux)
brew install railway

# Verify installation
railway --version
```

**Setup and Usage:**
```bash
# 1. Login to Railway (opens browser for authentication)
railway login

# 2. Link to project (run from project root)
cd /path/to/stock-analyzer-agent
railway link

# 3. View logs for a specific service
railway logs --service=agent --lines=200     # Last 200 log lines
railway logs --service=telegram-bot --lines=200

# 4. Stream logs in real-time (live monitoring)
railway logs --service=agent                  # Live streaming
railway logs --service=agent --filter "@level:error"  # Only errors

# 5. Filter logs by level or content
railway logs --service=agent --lines=100 --filter "@level:error"    # Last 100 errors
railway logs --service=agent --lines=100 --filter "@level:warn"     # Last 100 warnings
railway logs --service=agent --lines=100 --filter "workflow"        # Search for "workflow"
railway logs --service=agent --lines=100 --filter "ERROR AND Claude Code"  # Multiple terms

# 6. View environment variables
railway variables --service=agent

# 7. Deploy manually (if needed)
railway up --service=agent
```

**Common Debugging Workflow:**

When investigating production crashes:

1. **Check recent agent logs** for error traces:
   ```bash
   railway logs --service=agent --lines=200
   railway logs --service=agent --filter "@level:error"
   ```

2. **Look for DEBUG output** (enabled in production):
   ```
   [AgentService] DEBUG mode enabled for Claude Agent SDK
   [ProcessTransport] Spawning Claude Code process: ...
   Claude Code stderr: ...
   ```

3. **Check bot logs** to see user impact:
   ```bash
   railway logs --service=telegram-bot --lines=200
   ```

4. **Stream live logs** during testing:
   ```bash
   railway logs --service=agent    # Live stream
   ```

4. **Verify environment variables** are set correctly:
   ```bash
   railway variables --service=agent
   ```

**Important Notes:**
- Railway auto-deploys on git push to `main` branch
- CLI logs show real-time output from running services
- Use `--follow` flag to monitor ongoing deployments
- Each service (agent, telegram-bot) has separate logs

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

## Low-Level Messaging Architecture

**CRITICAL: All bot messages MUST go through BotMessagingService.**

### BotMessagingService Pattern

`libs/bot/telegram/src/lib/bot-messaging.service.ts` is a LOW-LEVEL service ensuring complete conversation history tracking:

```
┌─────────────────────────────────────────────────────────────┐
│                    ALL BOT MESSAGES                          │
│                           ↓                                  │
│                  BotMessagingService                         │
│                    (LOW LEVEL)                               │
│                           ↓                                  │
│              ┌────────────┴────────────┐                     │
│              ↓                         ↓                     │
│      Send to Telegram          Track in History             │
│      (ctx.reply())            (SessionOrchestrator)          │
└─────────────────────────────────────────────────────────────┘
```

**Core Methods:**
```typescript
// Send message and track in history (most common)
await botMessaging.sendAndTrack(ctx, chatId, 'Analysis complete!');

// Track user message (when bot receives input)
botMessaging.trackUserMessage(chatId, userMessage);

// Send document and track caption
await botMessaging.sendDocumentAndTrack(ctx, chatId, buffer, filename, caption);

// Track assistant message without sending (for streaming results already sent)
botMessaging.trackAssistantMessage(chatId, finalResponse);

// Send typing action (no history tracking)
await botMessaging.sendTypingAction(ctx);
```

**Critical Rules:**
1. NEVER call `ctx.reply()` directly - always use `botMessaging.sendAndTrack()`
2. NEVER call `sessionOrchestrator.addMessage()` directly - use BotMessagingService methods
3. Every message sent to Telegram MUST be tracked in conversation history
4. This ensures complete context for follow-up questions

**Why This Matters:**
- Workflow analysis results are tracked automatically
- Tool call notifications are tracked
- Error messages are tracked
- Status messages are tracked
- Follow-up questions have complete context

See `docs/ARCHITECTURE_LOW_LEVEL_MESSAGING.md` for complete details.

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

// All command handlers use BotMessagingService for message sending
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
- **Method organization** in TypeScript classes:
  1. Properties (before constructor)
  2. Constructor
  3. Public methods
  4. Private methods (at the end)
- **Tool() wrappers** must remain simple - execute tool and return result only, NO side effects or event emission
- **Event emission** happens in `agent.service.ts:executeQuery()` when processing messages, NOT in tool execution
- **Message handlers** follow extract → process → log pattern with clear separation of concerns
- **Use centralized enums** (`StreamEventType`, `ToolName`) instead of string literals
- **Helper functions** like `createEventName()` and `isToolName()` for consistency

## Message Handler Pattern

**AgentService Message Processing** (`libs/agent/core/src/lib/agent.service.ts`):

The service processes 7 SDK message types with clean separation of concerns:

```typescript
// Main handler delegates to specialized handlers
private handleUserMessage(userMessage, sessionId, ticker, streamToClient) {
  const toolResults = this.extractToolResults(apiMessage);  // 1. Extract

  for (const result of toolResults) {
    this.processToolResultBlock(result, ...);                // 2. Process
  }

  this.logToolResultsSummary(toolResults, sessionId);       // 3. Log
}

// Specialized handlers for each aspect
private extractToolResults(apiMessage): ToolResultData[]
private processToolResultBlock(result, ...)
private logToolResultsSummary(results, sessionId)
private processToolResult(toolName, block, ...) // Routes to tool-specific handlers
private handlePdfToolResult(toolResultData, ...)
```

**Pattern Benefits:**
- **Single Responsibility** - Each method has one clear purpose
- **Easy to Test** - Methods can be tested independently
- **Easy to Extend** - Adding new tool result handlers is straightforward
- **Clean Logging** - Separated from business logic

**Adding New Tool Result Handlers**:

1. Add new tool name to `ToolName` enum in `libs/shared/types/src/lib/enums.ts`:
```typescript
export enum ToolName {
  FETCH_COMPANY_DATA = 'fetch_company_data',
  CALCULATE_DCF = 'calculate_dcf',
  GENERATE_PDF = 'generate_pdf',
  MY_NEW_TOOL = 'my_new_tool',  // Add here
}
```

2. Add handler method in `agent.service.ts`:
```typescript
private handleMyToolResult(
  toolResultData: any,
  sessionId: string,
  ticker: string
): void {
  this.logger.log(`[${sessionId}] 🔧 My tool result processed`);

  this.eventEmitter.emit(
    createEventName(StreamEventType.MY_EVENT, sessionId),
    {
      ticker,
      ...toolResultData,
      timestamp: new Date().toISOString(),
    }
  );
}
```

3. Add routing in `processToolResult()`:
```typescript
else if (isToolName(toolName, ToolName.MY_NEW_TOOL)) {
  this.handleMyToolResult(toolResultData, sessionId, ticker);
}
```

**Key Principles:**
- **Extract first** - Separate data extraction from processing
- **Process cleanly** - Handle tool-specific logic in dedicated methods
- **Log separately** - Keep logging code separate from business logic
- **Use type-safe helpers** - Leverage `isToolName()` for matching
- **Emit events consistently** - Use `createEventName()` for all events
- when you run unit tests run them with -watch=false