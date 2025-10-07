# Stock Analyzer Agent

An AI-powered financial analysis platform built with Nx monorepo architecture, featuring Telegram bot interface, real-time streaming analysis, and Model Context Protocol (MCP) integration.

## Overview

Stock Analyzer Agent provides comprehensive stock analysis powered by Claude AI, combining fundamental analysis, DCF valuation, and real-time market data. The system streams analysis results in real-time via Server-Sent Events (SSE) and generates professional PDF reports.

### Key Features

- 🤖 **AI-Powered Analysis** - Advanced stock analysis using Anthropic's Claude with custom financial tools
- 📱 **Telegram Interface** - User-friendly Telegram bot with real-time streaming updates
- 📊 **Comprehensive Data** - Integration with Financial Modeling Prep API for financial statements, ratios, and metrics
- 💰 **DCF Valuation** - Discounted Cash Flow calculator with sensitivity analysis
- 📄 **PDF Reports** - Professional analysis reports via Anvil API
- 🔄 **Real-time Streaming** - SSE-based streaming of analysis thought process
- 🌐 **MCP Integration** - Standalone MCP server for external clients (Claude Desktop, etc.)

## Architecture

```
┌─────────────┐       ┌──────────────┐       ┌────────────┐
│   Telegram  │──────▶│  Telegram    │──────▶│   Agent    │
│    User     │       │     Bot      │  SSE  │  Service   │
└─────────────┘       └──────────────┘       └────────────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │  Anthropic  │
                                              │     SDK     │
                                              └─────────────┘
                                                     │
                                                     ▼
                                              ┌─────────────┐
                                              │  MCP Tools  │
                                              │  (Direct)   │
                                              └─────────────┘
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                ▼                ▼
                              ┌─────────┐    ┌──────────┐    ┌─────────┐
                              │   FMP   │    │  Alpha   │    │  Anvil  │
                              │   API   │    │ Vantage  │    │   API   │
                              └─────────┘    └──────────┘    └─────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     Standalone MCP Server (Optional)                     │
│                                                                           │
│  ┌──────────────┐       ┌─────────────┐       ┌────────────────┐       │
│  │    Claude    │──────▶│ MCP Server  │──────▶│   MCP Tools    │       │
│  │   Desktop    │ stdio │   (stdio)   │       │                │       │
│  └──────────────┘       └─────────────┘       └────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Project Structure

This is an Nx monorepo with the following structure:

```
stock-analyzer-agent/
├── apps/
│   ├── agent/              # NestJS service (port 3001)
│   ├── telegram-bot/       # Telegram bot (port 3002)
│   └── mcp-server/         # Standalone MCP server
├── libs/
│   ├── mcp/
│   │   ├── tools/         # Financial analysis tools (dual-use)
│   │   ├── server/        # MCP server implementation
│   │   └── integrations/  # External API adapters
│   ├── agent/
│   │   ├── core/          # Agent business logic
│   │   └── api/           # REST + SSE controllers
│   ├── bot/
│   │   ├── telegram/      # Telegram bot implementation
│   │   └── common/        # Shared bot utilities
│   └── shared/
│       ├── types/         # TypeScript types
│       ├── utils/         # Shared utilities
│       ├── config/        # Configuration
│       └── schemas/       # Validation schemas
└── dist/                   # Build output
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- [Anthropic API Key](https://console.anthropic.com/)
- [Financial Modeling Prep API Key](https://financialmodelingprep.com/)
- (Optional) Alpha Vantage API Key
- (Optional) Anvil API Key for PDF generation

### Installation

```bash
# Clone the repository
git clone https://github.com/alonshav/stock-analyzer-agent.git
cd stock-analyzer-agent

# Install dependencies
npm install

# Build all projects
npm run build:agent
npm run build:telegram-bot
npm run build:mcp-server
```

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Agent Service
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
FMP_API_KEY=your-fmp-api-key
ALPHA_VANTAGE_KEY=your-alpha-vantage-key  # Optional
ANVIL_API_KEY=your-anvil-api-key          # Optional

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
AGENT_SERVICE_URL=http://localhost:3001
```

### Running in Development

```bash
# Run all services in parallel
npm run dev

# Or run individually
nx serve agent           # http://localhost:3001
nx serve telegram-bot    # http://localhost:3002
nx serve mcp-server      # stdio mode
```

### Running in Production

```bash
# Start services
npm run start:agent
npm run start:telegram-bot

# Or with PM2
pm2 start npm --name "agent" -- run start:agent
pm2 start npm --name "telegram-bot" -- run start:telegram-bot
```

## Usage

### Telegram Bot

1. Start a chat with your bot on Telegram
2. Send `/start` to begin
3. Enter a stock ticker (e.g., `AAPL`, `GOOGL`, `TSLA`)
4. Receive real-time streaming analysis
5. Get a downloadable PDF report

### MCP Server (Claude Desktop)

The MCP server can be used standalone with Claude Desktop or other MCP clients:

```bash
# Run the server
npm run build:mcp-server
npm run start:mcp-server
```

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "stock-analyzer": {
      "command": "node",
      "args": ["/path/to/stock-analyzer-agent/dist/apps/mcp-server/main.js"],
      "env": {
        "FMP_API_KEY": "your-api-key"
      }
    }
  }
}
```

Or use via npx (after publishing):

```bash
npx stock-analyzer-mcp
```

### Available Tools

The MCP tools provide:

- **fetch_company_data** - Retrieve financial statements, ratios, metrics, and company profile
- **calculate_dcf** - Perform Discounted Cash Flow valuation with sensitivity analysis
- **test_api_connection** - Test FMP API connectivity

## Development

### Common Commands

```bash
# Build specific project
nx build agent-core
nx build mcp-tools

# Run tests
npm run test                    # All tests
nx test agent-core              # Specific project
nx affected --target=test       # Only affected tests

# Linting
npm run lint
nx affected --target=lint

# View dependency graph
nx graph
```

### Adding a New Tool

1. Create implementation in `libs/mcp/tools/src/lib/`
2. Export from `libs/mcp/tools/src/index.ts`
3. Add to `ToolRegistry.getTools()` with schema
4. Implement handler in `ToolRegistry.executeTool()`

### Adding a New API Integration

```bash
# Generate library
nx g @nx/js:library my-api --directory=libs/mcp/integrations --no-interactive

# Implement adapter
# - Use CacheManager for caching
# - Use RateLimiter for rate limiting
# - Export from library index
```

## Deployment

### Railway Deployment

The project is configured for Railway deployment with two services:

**telegram-bot** (public)
```bash
Build Command: npm run build:telegram-bot
Start Command: npm run start:telegram-bot
Port: 3002
```

**agent** (internal)
```bash
Build Command: npm run build:agent
Start Command: npm run start:agent
Port: 3001
```

Set environment variables in Railway dashboard for each service.

### Docker Deployment (Coming Soon)

Docker support is planned for containerized deployment.

## Technology Stack

- **Framework**: [Nx](https://nx.dev/) - Monorepo build system
- **Backend**: [NestJS](https://nestjs.com/) - Node.js framework
- **AI**: [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Claude integration
- **MCP**: [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) - Tool protocol
- **Bot**: [Telegram Bot API](https://core.telegram.org/bots/api)
- **Financial Data**: [Financial Modeling Prep](https://financialmodelingprep.com/)
- **PDF Generation**: [Anvil API](https://www.useanvil.com/)
- **Language**: TypeScript 5.5+

## Architecture Patterns

### Thin Apps, Rich Libraries

- Apps (`apps/`) contain only bootstrap code (~50-100 lines)
- All business logic resides in libraries (`libs/`)
- Libraries are independently testable and reusable

### Dual-Use Tools

- Tools in `@stock-analyzer/mcp/tools` serve two purposes:
  1. Direct import by Agent via `createToolRegistry()`
  2. Exposed by MCP Server via stdio protocol
- Single source of truth for tool implementations

### Real-time Streaming

- Agent emits events during analysis
- SSE controller forwards events to clients
- Telegram bot receives and displays updates in real-time

## Performance

- **Caching**: Intelligent caching with configurable TTLs
  - Company profiles: 24 hours
  - Real-time quotes: 1 minute
  - Financial statements: 1 hour
- **Rate Limiting**: Token bucket algorithm prevents API throttling
- **Parallel Processing**: Nx cache and parallel builds

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Use Nx CLI generators for new libraries/apps (`--no-interactive`)
2. Follow existing code patterns and structure
3. Add tests for new functionality
4. Update documentation (CLAUDE.md and README.md)
5. Run linting and tests before submitting PRs

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [stock-analyzer-agent/issues](https://github.com/alonshav/stock-analyzer-agent/issues)
- Email: [Your contact]

## Acknowledgments

- [Anthropic](https://www.anthropic.com/) - Claude AI platform
- [Nx](https://nx.dev/) - Monorepo tooling
- [NestJS](https://nestjs.com/) - Backend framework
- [Financial Modeling Prep](https://financialmodelingprep.com/) - Financial data API
