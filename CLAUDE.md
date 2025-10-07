# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock Analyzer is an Nx monorepo for AI-powered financial analysis with three services:

- **Agent**: NestJS service orchestrating LLM-based stock analysis using Anthropic SDK
- **Telegram Bot**: User interface streaming analysis results via SSE
- **MCP Server**: Financial data tools (runs as stdio subprocess of Agent)

**Critical**: Agent uses Anthropic SDK with direct tool imports from `@stock-analyzer/mcp/tools` (NOT MCP client).

## Architecture Flow

```
User → Telegram Bot → Agent (SSE) → Anthropic SDK → MCP Tools → External APIs
```

### Key Principles

1. Apps are thin shells (~50-100 lines) - business logic lives in libraries
2. Agent imports tools directly from `@stock-analyzer/mcp/tools`
3. SSE streams LLM thought process only (not final reports)
4. Two-query approach: full analysis + executive summary
5. External PDF generation via Anvil API

## Structure

```
apps/                    # Thin bootstraps
  ├── agent/            # Port 3001
  ├── telegram-bot/     # Port 3002
  └── mcp-server/       # Port 3003 (stdio mode)
libs/                   # All business logic
  ├── mcp/
  │   ├── tools/       # Tool implementations
  │   ├── server/      # MCP server
  │   └── integrations/ # API adapters
  ├── agent/
  │   ├── core/        # AgentService, StreamService
  │   └── api/         # REST + SSE controllers
  ├── bot/telegram/    # Telegram implementation
  └── shared/          # Types, utils, config
```

## Development Commands

```bash
# Development
npm run dev              # All services
nx serve agent           # Port 3001
nx serve telegram-bot    # Port 3002

# Build
npm run build:agent
npm run build:telegram-bot

# Start production
npm run start:agent
npm run start:telegram-bot

# Test
npm run test
nx test agent-core
nx test bot-telegram

# Lint
npm run lint

# View graph
nx graph
```

## Library Dependencies

**Critical**: Agent depends on `@stock-analyzer/mcp/tools` but NOT `@stock-analyzer/mcp/server`.

```
shared/types → shared/utils
    ↑
mcp/tools → mcp/integrations
    ↑
agent/core → agent/api
    ↑
bot/telegram
```

## TypeScript Path Mappings

- `@stock-analyzer/mcp/tools` - Tool implementations (imported directly by Agent)
- `@stock-analyzer/mcp/server` - MCP server (NOT used by Agent)
- `@stock-analyzer/agent/core` - Agent service logic
- `@stock-analyzer/agent/api` - REST/SSE controllers
- `@stock-analyzer/bot/telegram` - Telegram bot
- `@stock-analyzer/shared/*` - Types, utils, config

## Agent Implementation Pattern

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getToolsRegistry } from '@stock-analyzer/mcp/tools';

const stream = query(prompt, {
  systemPrompt: STOCK_VALUATION_FRAMEWORK,
  tools: getToolsRegistry(), // Direct tool import
});
```

## SSE Streaming Pattern

```typescript
// Agent emits events
this.eventEmitter.emit(`analysis.chunk.${sessionId}`, data);

// SSE Controller forwards
res.write(`data: ${JSON.stringify({ type: 'chunk', ...data })}\n\n`);
```

## Environment Variables

### Agent (Port 3001)
```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
FMP_API_KEY=...
ALPHA_VANTAGE_KEY=...
ANVIL_API_KEY=...
```

### Telegram Bot (Port 3002)
```bash
TELEGRAM_BOT_TOKEN=...
AGENT_SERVICE_URL=http://localhost:3001
```

## Railway Deployment

Two services:
- `telegram-bot` (public, port 3002)
- `agent` (internal, port 3001)

MCP tools bundled with Agent (stdio mode).

```bash
# Build commands
npm run build:telegram-bot
npm run build:agent

# Start commands
npm run start:telegram-bot
npm run start:agent
```

## Implementation Notes

- Framework v2.3 system prompt in `libs/agent/core/src/lib/prompts/framework-v2.3.ts`
- PDF generation uses Anvil API (no Puppeteer)
- Tools provided directly to Anthropic SDK (no MCP client protocol)
- Stream thought process only, save final reports to variables
- Two-query approach: full analysis query + executive summary query

## Detailed Documentation

See `implementation-plans/` for complete architecture:
- `Stock Analyzer - Unified Nx Monorepo Architecture.md`
- `Stock Analyzer Agent - NestJS Implementation.md`
- `Telegram Bot - Aligned Nx Implementation.md`
- `Railway Deployment Guide - Aligned Nx Monorepo.md`
- `PDF Generator Implementation Plan - External API Strategy.md`
- always opt for using nx cli commands instead of generating files on your own
- when running nx cli commands always run in non interactive mode, add the --no-interactive flag