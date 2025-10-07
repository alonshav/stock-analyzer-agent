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
5. **SSE streams thought process** - not final reports
6. **Two-query approach** - full analysis + executive summary
7. **External PDF generation** - via Anvil API (no Puppeteer)

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
  │   └── api/            # REST + SSE controllers
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
npm run start:agent
npm run start:telegram-bot
npm run start:mcp-server

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
   mcp/server    agent/core (AgentService imports tools directly)
       ↓              ↓
   mcp-server     agent/api (REST + SSE controllers)
     (app)            ↓
                 bot/telegram
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
import { Anthropic } from '@anthropic-ai/sdk';
import { createToolRegistry } from '@stock-analyzer/mcp/tools';

export class AgentService {
  private anthropic: Anthropic;

  async analyzeStock(ticker: string) {
    const registry = createToolRegistry();
    const tools = registry.getTools();

    const stream = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: tools, // Direct tool integration
      messages: [/* ... */],
      stream: true,
    });

    // Process stream...
  }
}
```

## MCP Server Standalone Usage

The MCP Server can be run as a standalone service for external MCP clients:

```bash
# Build and run
npm run build:mcp-server
npm run start:mcp-server

# Or via npx (after publishing)
npx stock-analyzer-mcp

# Requires environment variable
export FMP_API_KEY=your-api-key
```

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "stock-analyzer": {
      "command": "node",
      "args": ["/path/to/dist/apps/mcp-server/main.js"],
      "env": {
        "FMP_API_KEY": "your-api-key"
      }
    }
  }
}
```

The `package.json` includes a `bin` field pointing to `dist/apps/mcp-server/main.js` with shebang for direct execution.

## SSE Streaming Pattern

```typescript
// Agent emits events during analysis
this.eventEmitter.emit(`analysis.chunk.${sessionId}`, {
  type: 'chunk',
  content: data,
});

// SSE Controller forwards to client
res.write(`data: ${JSON.stringify({
  type: 'chunk',
  content: data
})}\n\n`);

// Event types: 'start', 'chunk', 'tool_use', 'complete', 'error'
```

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
  - `bundle: false` (preserves library structure)
  - `format: cjs` (CommonJS for Node.js)
  - `banner: { js: "#!/usr/bin/env node" }` (adds shebang for direct execution)
  - `generatePackageJson: true` (creates standalone package.json)

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
5. Tool is now available to both Agent and MCP Server

### Adding a New API Integration

1. Use Nx generator: `nx g @nx/js:library my-api --directory=libs/mcp/integrations --no-interactive`
2. Create adapter class in `libs/mcp/integrations/src/lib/my-api/`
3. Use `CacheManager` and `RateLimiter` from `@stock-analyzer/shared/utils`
4. Export adapter from library index

### Streaming Analysis from Agent

1. Agent calls `analyzeStock()` with ticker
2. Anthropic SDK streams tool calls and responses
3. Agent emits events via `EventEmitter` with session ID
4. SSE controller listens for events and forwards to client
5. Client receives real-time updates of analysis progress