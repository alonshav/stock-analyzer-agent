# Railway Deployment Guide - Aligned Nx Monorepo

## Architecture Overview

Railway Project (Internal Network):

- **telegram-bot service** (Public, Port 3002)
  - Uses: `@stock-analyzer/bot/telegram`
  - Consumes Agent’s SSE endpoint
- **agent service** (Internal, Port 3001)
  - Uses: `@stock-analyzer/agent/core`, `@stock-analyzer/agent/api`
  - Uses: `@stock-analyzer/mcp/tools` (direct tool imports)
  - Runs MCP as stdio subprocess initially
- **mcp-server** (Not deployed separately initially)
  - Used as stdio subprocess within Agent
  - Future: Optional separate service with SSE/HTTP
- **redis** (Optional)
  - Caching layer

-----

## MCP Server Deployment Strategy

### Phase 1: stdio Mode (Current)

- MCP tools bundled with Agent service
- Agent spawns MCP as child process via stdio
- **No separate deployment needed**
- Simplest architecture for initial deployment

### Phase 2: Separate Service (Future)

- Deploy MCP as independent Railway service
- Agent connects via SSE or HTTP
- Uses Railway’s internal networking
- Better for scaling and isolation

**This guide covers Phase 1.** Phase 2 configuration included at the end.

-----

## Prerequisites

1. ✅ Nx monorepo with aligned structure
1. ✅ GitHub repository connected to Railway
1. ✅ Railway account with project created
1. ✅ API Keys:
- Telegram Bot Token
- Anthropic API Key
- FMP API Key
- Alpha Vantage API Key

-----

## Step 1: Prepare Root package.json

The root `package.json` must have Railway-specific build/start scripts:

```json
{
  "name": "@stock-analyzer/source",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "// Railway Build Commands": "",
    "build:telegram-bot": "nx build telegram-bot --configuration=production",
    "build:agent": "nx build agent --configuration=production",
    "build:mcp-server": "nx build mcp-server --configuration=production",
    
    "// Railway Start Commands": "",
    "start:telegram-bot": "node dist/apps/telegram-bot/main.js",
    "start:agent": "node dist/apps/agent/main.js",
    "start:mcp-server": "node dist/apps/mcp-server/main.js",
    
    "// Development": "",
    "dev": "nx run-many --target=serve --all --parallel"
  }
}
```

-----

## Step 2: Configure Nx Apps for Production

### telegram-bot (apps/telegram-bot/project.json)

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
        "generatePackageJson": true,
        "extractLicenses": true
      },
      "configurations": {
        "production": {
          "optimization": true,
          "extractLicenses": true,
          "fileReplacements": [
            {
              "replace": "apps/telegram-bot/src/environment.ts",
              "with": "apps/telegram-bot/src/environment.prod.ts"
            }
          ]
        }
      }
    }
  }
}
```

### agent (apps/agent/project.json)

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/agent/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/webpack:webpack",
      "outputs": ["{options.outputPath}"],
      "options": {
        "target": "node",
        "compiler": "tsc",
        "outputPath": "dist/apps/agent",
        "main": "apps/agent/src/main.ts",
        "tsConfig": "apps/agent/tsconfig.app.json",
        "generatePackageJson": true,
        "extractLicenses": true
      },
      "configurations": {
        "production": {
          "optimization": true,
          "extractLicenses": true,
          "fileReplacements": [
            {
              "replace": "apps/agent/src/environment.ts",
              "with": "apps/agent/src/environment.prod.ts"
            }
          ]
        }
      }
    }
  }
}
```

### mcp-server (apps/mcp-server/project.json)

Note: This is built but NOT deployed as a separate service initially.

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/mcp-server/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/webpack:webpack",
      "outputs": ["{options.outputPath}"],
      "options": {
        "target": "node",
        "compiler": "tsc",
        "outputPath": "dist/apps/mcp-server",
        "main": "apps/mcp-server/src/main.ts",
        "tsConfig": "apps/mcp-server/tsconfig.app.json",
        "generatePackageJson": true,
        "extractLicenses": true
      },
      "configurations": {
        "production": {
          "optimization": true,
          "extractLicenses": true
        }
      }
    }
  }
}
```

-----

## Step 3: Create Environment Files

### apps/telegram-bot/src/environment.prod.ts

```typescript
export default {
  production: true,
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    webhookDomain: process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : undefined,
    webhookPath: '/api/telegram/webhook',
    webhookEnabled: !!process.env.RAILWAY_PUBLIC_DOMAIN,
    agentUrl: process.env.AGENT_SERVICE_URL || 'http://agent.railway.internal:3001',
  }
};
```

### apps/telegram-bot/src/environment.ts

```typescript
export default {
  production: false,
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookDomain: undefined,
    webhookPath: '/api/telegram/webhook',
    webhookEnabled: false,
    agentUrl: process.env.AGENT_SERVICE_URL || 'http://localhost:3001',
  }
};
```

### apps/agent/src/environment.prod.ts

```typescript
export default {
  production: true,
  port: parseInt(process.env.PORT || '3001'),
  host: '0.0.0.0', // Required for Railway
  
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '16000'),
    maxTurns: parseInt(process.env.ANTHROPIC_MAX_TURNS || '20'),
  },
  
  // MCP Mode: stdio (Phase 1)
  mcp: {
    mode: 'stdio' as const, // or 'http' in Phase 2
    // Only used when mode is 'http':
    serverUrl: process.env.MCP_SERVER_URL || 'http://mcp-server.railway.internal:3003',
  },
  
  cache: {
    redis: process.env.REDIS_URL,
    ttl: parseInt(process.env.CACHE_TTL || '3600'),
  },
  
  pdf: {
    storagePath: process.env.PDF_STORAGE_PATH || '/app/storage/pdfs',
  },
};
```

### apps/agent/src/environment.ts

```typescript
export default {
  production: false,
  port: parseInt(process.env.PORT || '3001'),
  host: 'localhost',
  
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '16000'),
    maxTurns: parseInt(process.env.ANTHROPIC_MAX_TURNS || '20'),
  },
  
  mcp: {
    mode: 'stdio' as const,
    serverUrl: 'http://localhost:3003',
  },
  
  cache: {
    redis: undefined,
    ttl: 3600,
  },
  
  pdf: {
    storagePath: './storage/pdfs',
  },
};
```

-----

## Step 4: Add Health Check Endpoints

### Agent Health Check (libs/agent/api/src/lib/health.controller.ts)

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      status: 'healthy',
      service: 'agent',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
  
  @Get('api/mcp/health')
  mcpHealth() {
    // In stdio mode, MCP is always "healthy" if agent is running
    return {
      status: 'healthy',
      mode: 'stdio',
      connected: true,
    };
  }
}
```

### Telegram Bot Health Check (libs/bot/telegram/src/lib/telegram-bot.controller.ts)

```typescript
import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';

@Controller('telegram')
export class TelegramBotController {
  constructor(private readonly botService: TelegramBotService) {}
  
  @Get('health')
  health() {
    return {
      status: 'healthy',
      service: 'telegram-bot',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
  
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() update: any) {
    await this.botService.handleUpdate(update);
    return { ok: true };
  }
}
```

-----

## Step 5: Railway Service Configuration

### Service 1: telegram-bot (PUBLIC)

**Railway Dashboard Settings:**

- **Service Name:** `telegram-bot`
- **Root Directory:** `/` (monorepo root)
- **Build Command:** `npm run build:telegram-bot`
- **Start Command:** `npm run start:telegram-bot`
- **Generate Domain:** ✅ YES (for webhook)
- **Health Check Path:** `/api/telegram/health`
- **Port:** `3002`

**Environment Variables:**

```bash
NODE_ENV=production
PORT=3002
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Railway provides this automatically:
# RAILWAY_PUBLIC_DOMAIN=telegram-bot-production-xxxx.up.railway.app

# Internal agent URL (Railway's private network)
AGENT_SERVICE_URL=http://agent.railway.internal:3001
```

**After Deployment:**

1. Get the public domain from Railway dashboard
1. Set Telegram webhook:
   
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<RAILWAY_PUBLIC_DOMAIN>/api/telegram/webhook"
   ```

-----

### Service 2: agent (INTERNAL)

**Railway Dashboard Settings:**

- **Service Name:** `agent`
- **Root Directory:** `/`
- **Build Command:** `npm run build:agent`
- **Start Command:** `npm run start:agent`
- **Generate Domain:** ❌ NO (internal only)
- **Health Check Path:** `/health`
- **Port:** `3001`

**Environment Variables:**

```bash
NODE_ENV=production
PORT=3001

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=16000
ANTHROPIC_MAX_TURNS=20

# Financial Data APIs
FMP_API_KEY=your_fmp_key
ALPHA_VANTAGE_KEY=your_av_key
SEC_EDGAR_EMAIL=contact@example.com

# MCP Configuration (Phase 1: stdio)
# No MCP_SERVER_URL needed - tools bundled with agent

# PDF Storage
PDF_STORAGE_PATH=/app/storage/pdfs

# Optional Redis for caching
REDIS_URL=redis://default:password@redis.railway.internal:6379
CACHE_TTL=3600
```

-----

### Service 3: redis (OPTIONAL)

**Railway Dashboard Settings:**

- Use Railway’s **Redis plugin**
- Or deploy your own Redis container
- The `REDIS_URL` will be automatically added to your services

-----

## Step 6: GitHub Actions CI/CD (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main, production]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Test
        run: npm run test
      
      - name: Build affected apps
        run: npx nx affected --target=build --configuration=production
      
      # Railway CLI auto-deploys on push to main
      # No manual deployment needed if Railway GitHub integration is set up
```

-----

## Step 7: Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured in Railway
- [ ] GitHub repository connected to Railway
- [ ] Health check endpoints implemented
- [ ] Production environment files created

### Deployment

- [ ] Deploy `agent` service first
- [ ] Verify agent health: `http://agent.railway.internal:3001/health`
- [ ] Deploy `telegram-bot` service
- [ ] Verify bot health: `https://<bot-domain>/api/telegram/health`
- [ ] Set Telegram webhook URL

### Post-Deployment

- [ ] Test Telegram bot with `/start` command
- [ ] Test analysis: `/analyze AAPL`
- [ ] Monitor Railway logs for errors
- [ ] Verify SSE streaming works
- [ ] Check PDF generation

-----

## Step 8: Monitoring & Debugging

### Railway Dashboard

- View logs: Click on service → “Logs” tab
- Monitor metrics: CPU, Memory, Network
- Check health checks: Should show green

### Useful Log Commands

**Agent logs:**

```bash
# Via Railway CLI
railway logs -s agent

# Or in Railway dashboard
# agent service → Logs tab
```

**Bot logs:**

```bash
railway logs -s telegram-bot
```

### Common Issues

**Issue: Bot can’t connect to Agent**

- **Solution:** Verify `AGENT_SERVICE_URL=http://agent.railway.internal:3001`
- Check agent service is running: Visit `/health` endpoint

**Issue: Telegram webhook not receiving updates**

- **Solution:** Check webhook is set correctly
- Verify: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

**Issue: Agent can’t access Anthropic API**

- **Solution:** Verify `ANTHROPIC_API_KEY` is set
- Check Railway logs for API errors

**Issue: MCP tools failing**

- **Solution:** Check API keys (FMP, Alpha Vantage) are correct
- Verify tools are bundled: Check `dist/apps/agent/` includes `@stock-analyzer/mcp/tools`

-----

## Phase 2: Separate MCP Server Deployment (Future)

When you want to deploy MCP as a separate service (better for scaling):

### Service Configuration: mcp-server

**Railway Dashboard Settings:**

- **Service Name:** `mcp-server`
- **Root Directory:** `/`
- **Build Command:** `npm run build:mcp-server`
- **Start Command:** `npm run start:mcp-server`
- **Generate Domain:** ❌ NO (internal only)
- **Health Check Path:** `/health`
- **Port:** `3003`

**Environment Variables:**

```bash
NODE_ENV=production
PORT=3003

# Financial Data APIs
FMP_API_KEY=your_fmp_key
ALPHA_VANTAGE_KEY=your_av_key
SEC_EDGAR_EMAIL=contact@example.com

# Transport mode
MCP_TRANSPORT=sse
# or MCP_TRANSPORT=http
```

### Agent Configuration Changes (Phase 2)

Update `apps/agent/src/environment.prod.ts`:

```typescript
mcp: {
  mode: 'http', // Changed from 'stdio'
  serverUrl: 'http://mcp-server.railway.internal:3003',
}
```

Add to agent environment variables:

```bash
MCP_SERVER_URL=http://mcp-server.railway.internal:3003
```

### Migration Steps (stdio → SSE/HTTP)

1. Deploy `mcp-server` as new service
1. Verify MCP health: `http://mcp-server.railway.internal:3003/health`
1. Update agent environment: `MCP_SERVER_URL=...`
1. Update agent code to use HTTP client instead of tools
1. Redeploy agent service
1. Test end-to-end flow
1. Monitor both services

-----

## Network Architecture Diagram

### Phase 1 (Current - stdio):

```
Internet
   ↓
Telegram API
   ↓
telegram-bot (Public: 3002)
   ↓
Railway Private Network
   ↓
agent (Internal: 3001)
   └─→ MCP Tools (bundled)
       └─→ External APIs (FMP, AlphaVantage, etc.)
```

### Phase 2 (Future - SSE/HTTP):

```
Internet
   ↓
Telegram API
   ↓
telegram-bot (Public: 3002)
   ↓
Railway Private Network
   ↓
agent (Internal: 3001)
   ↓
Railway Private Network
   ↓
mcp-server (Internal: 3003)
   └─→ External APIs (FMP, AlphaVantage, etc.)
```

-----

## Summary

### Current Deployment (Phase 1)

- ✅ **2 Railway Services:** telegram-bot, agent
- ✅ **MCP:** Bundled with agent (stdio)
- ✅ **Communication:** Bot → Agent (SSE), Agent → Tools (direct)
- ✅ **Simplest setup:** Fewer moving parts

### Future Deployment (Phase 2)

- ⏭️ **3 Railway Services:** telegram-bot, agent, mcp-server
- ⏭️ **MCP:** Separate service (SSE or HTTP)
- ⏭️ **Communication:** Bot → Agent (SSE), Agent → MCP (HTTP)
- ⏭️ **Better scaling:** Independent MCP scaling

**Start with Phase 1, migrate to Phase 2 when needed.**