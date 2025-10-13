# Session Management Architecture Migration Plan

## Overview

This document outlines the migration from Agent-owned session management to a Bot-owned, stateless Agent architecture with pluggable storage backends.

## Current Problems

1. **Scattered Session Management**:
   - `SessionManagerService` in `libs/agent/session` (Agent owns sessions)
   - `StreamManagerService.activeSessions` in Bot (duplicate tracking)
   - `AgentService` handles session lifecycle (tight coupling)

2. **Tight Coupling**:
   - Agent is tightly coupled to session lifecycle
   - Hard to add new workflows (analyze, sentiment, DCF, etc.)
   - Session state lives in Agent process (port 3001)

3. **Storage Limitations**:
   - Only in-memory storage (Map)
   - No persistence or scalability path
   - Can't support multi-instance deployments

## Target Architecture

### Principle: Bot is Stateful, Agent is Stateless

```
┌─────────────────────────────────────────────────────────────┐
│ Telegram Bot (Port 3002) - STATEFUL                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ SessionOrchestrator                                 │    │
│  │ - createSession()                                   │    │
│  │ - getSession()                                      │    │
│  │ - completeSession()                                 │    │
│  │ - addConversation()                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ISessionRepository (interface)                      │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│     ┌──────────────┬─────────────┬──────────────────┐      │
│     │ InMemory     │ Redis       │ PostgreSQL       │      │
│     │ Repository   │ Repository  │ Repository       │      │
│     └──────────────┴─────────────┴──────────────────┘      │
│                                                              │
│  TelegramBotService                                         │
│    ↓ HTTP POST with sessionId                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Agent (Port 3001) - STATELESS                               │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ WorkflowService (registry pattern)                  │    │
│  │                                                     │    │
│  │ WORKFLOW_CONFIGS: Record<WorkflowType, Config>     │    │
│  │   - FULL_ANALYSIS                                   │    │
│  │   - SENTIMENT                                       │    │
│  │   - DCF_VALUATION                                   │    │
│  │   - etc.                                            │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│  AgentService.executeQuery(sessionId, workflowType, params) │
│    - Receives sessionId (doesn't create or manage it)       │
│    - Looks up workflow config from registry                 │
│    - Executes AI query with workflow-specific config        │
│    - Returns SSE stream                                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Bot Owns Sessions**: All session CRUD operations happen in Bot
2. **Agent is Stateless**: Agent receives sessionId, never creates or manages sessions
3. **Pluggable Storage**: ISessionRepository interface supports multiple backends
4. **Registry Pattern**: Workflows use key-value registry (NO switch cases)
5. **Structured Parameters**: Workflow configs pass structured data, not text prompts
6. **HTTP Communication**: Bot and Agent are separate processes (ports 3002 and 3001)

## Migration Phases

### Phase 1: Bot-Owned Sessions with In-Memory Storage

**Goal**: Move session management to Bot while keeping in-memory storage (minimal risk).

#### Phase 1.1: Create Session Store Library

**Location**: `libs/bot/common/src/lib/session-store/`

**Why bot/common**: Shared across all bot implementations (Telegram, Slack, Discord, etc.)

```bash
# Generate library if needed
nx g @nx/js:library session-store --directory=libs/bot/common --no-interactive
```

**Files to Create**:

1. `libs/bot/common/src/lib/session-store/interfaces/session.interface.ts`:
```typescript
export enum SessionStatus {
  ACTIVE = 'active',           // Currently analyzing
  COMPLETED = 'completed',     // Analysis done, available for conversation
  STOPPED = 'stopped',         // User manually stopped
  EXPIRED = 'expired',         // Timed out
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AnalysisSession {
  chatId: string;
  sessionId: string;
  ticker: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;

  // Analysis data (only for COMPLETED sessions)
  fullAnalysis?: string;
  executiveSummary?: string;

  // Conversation history (for follow-up questions)
  conversationHistory: ConversationMessage[];
}
```

2. `libs/bot/common/src/lib/session-store/interfaces/session-repository.interface.ts`:
```typescript
import { AnalysisSession, SessionStatus, ConversationMessage } from './session.interface';

export interface ISessionRepository {
  // Session lifecycle
  createSession(chatId: string, ticker: string): AnalysisSession;
  getSession(chatId: string): AnalysisSession | null;
  updateSessionStatus(chatId: string, status: SessionStatus): void;
  deleteSession(chatId: string): void;

  // Analysis data
  saveAnalysisResults(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): void;

  // Conversation management
  addConversationMessage(
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): void;
  getConversationHistory(chatId: string): ConversationMessage[];

  // Cleanup
  cleanupExpiredSessions(expiryDurationMs: number): number;

  // Query methods
  getAllActiveSessions(): AnalysisSession[];
  getSessionsByStatus(status: SessionStatus): AnalysisSession[];
}
```

3. `libs/bot/common/src/lib/session-store/repositories/in-memory-session.repository.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ISessionRepository,
  AnalysisSession,
  SessionStatus,
  ConversationMessage,
} from '../interfaces';

@Injectable()
export class InMemorySessionRepository implements ISessionRepository {
  private sessions = new Map<string, AnalysisSession>();

  createSession(chatId: string, ticker: string): AnalysisSession {
    const session: AnalysisSession = {
      chatId,
      sessionId: uuidv4(),
      ticker,
      status: SessionStatus.ACTIVE,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      conversationHistory: [],
    };

    this.sessions.set(chatId, session);
    return session;
  }

  getSession(chatId: string): AnalysisSession | null {
    return this.sessions.get(chatId) || null;
  }

  updateSessionStatus(chatId: string, status: SessionStatus): void {
    const session = this.sessions.get(chatId);
    if (!session) return;

    session.status = status;
    session.lastActivityAt = new Date();

    if (status === SessionStatus.COMPLETED) {
      session.completedAt = new Date();
    }
  }

  deleteSession(chatId: string): void {
    this.sessions.delete(chatId);
  }

  saveAnalysisResults(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): void {
    const session = this.sessions.get(chatId);
    if (!session) return;

    session.fullAnalysis = fullAnalysis;
    session.executiveSummary = executiveSummary;
    session.status = SessionStatus.COMPLETED;
    session.completedAt = new Date();
    session.lastActivityAt = new Date();
  }

  addConversationMessage(
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): void {
    const session = this.sessions.get(chatId);
    if (!session) return;

    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    session.lastActivityAt = new Date();
  }

  getConversationHistory(chatId: string): ConversationMessage[] {
    const session = this.sessions.get(chatId);
    return session?.conversationHistory || [];
  }

  cleanupExpiredSessions(expiryDurationMs: number): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [chatId, session] of this.sessions.entries()) {
      // Only expire COMPLETED sessions, never ACTIVE ones
      if (session.status !== SessionStatus.COMPLETED) continue;

      const timeSinceActivity = now - session.lastActivityAt.getTime();
      if (timeSinceActivity > expiryDurationMs) {
        session.status = SessionStatus.EXPIRED;
        this.sessions.delete(chatId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  getAllActiveSessions(): AnalysisSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === SessionStatus.ACTIVE
    );
  }

  getSessionsByStatus(status: SessionStatus): AnalysisSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === status);
  }
}
```

#### Phase 1.2: Create Session Orchestrator

**Location**: `libs/bot/common/src/lib/session-store/session-orchestrator.service.ts`

**Purpose**: High-level session lifecycle management (delegates to repository).

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ISessionRepository } from './interfaces/session-repository.interface';
import { AnalysisSession, SessionStatus } from './interfaces/session.interface';

@Injectable()
export class SessionOrchestrator {
  private readonly logger = new Logger(SessionOrchestrator.name);
  private readonly SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

  constructor(private readonly sessionRepository: ISessionRepository) {}

  // Session lifecycle
  createSession(chatId: string, ticker: string): AnalysisSession {
    this.logger.log(`Creating session for chat ${chatId}, ticker ${ticker}`);
    return this.sessionRepository.createSession(chatId, ticker);
  }

  getActiveSession(chatId: string): AnalysisSession | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status === SessionStatus.ACTIVE ? session : null;
  }

  getCompletedSession(chatId: string): AnalysisSession | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status === SessionStatus.COMPLETED ? session : null;
  }

  completeSession(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): void {
    this.logger.log(`Completing session for chat ${chatId}`);
    this.sessionRepository.saveAnalysisResults(
      chatId,
      fullAnalysis,
      executiveSummary
    );
  }

  stopSession(chatId: string): void {
    this.logger.log(`Stopping session for chat ${chatId}`);
    this.sessionRepository.updateSessionStatus(chatId, SessionStatus.STOPPED);
  }

  // Conversation management
  addUserMessage(chatId: string, content: string): void {
    this.sessionRepository.addConversationMessage(chatId, 'user', content);
  }

  addAssistantMessage(chatId: string, content: string): void {
    this.sessionRepository.addConversationMessage(chatId, 'assistant', content);
  }

  getConversationHistory(chatId: string) {
    return this.sessionRepository.getConversationHistory(chatId);
  }

  // Cleanup
  @Cron(CronExpression.EVERY_5_MINUTES)
  private cleanupExpiredSessions(): void {
    const count = this.sessionRepository.cleanupExpiredSessions(
      this.SESSION_EXPIRY_MS
    );
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired sessions`);
    }
  }

  // Status queries
  getSessionStatus(chatId: string): SessionStatus | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status || null;
  }

  hasActiveSession(chatId: string): boolean {
    return this.getActiveSession(chatId) !== null;
  }

  hasCompletedSession(chatId: string): boolean {
    return this.getCompletedSession(chatId) !== null;
  }
}
```

#### Phase 1.3: Create Workflow Registry in Agent

**Location**: `libs/agent/core/src/lib/workflows/`

**Files to Create**:

1. `libs/agent/core/src/lib/workflows/workflow.types.ts`:
```typescript
export enum WorkflowType {
  FULL_ANALYSIS = 'full_analysis',
  SENTIMENT = 'sentiment',
  DCF_VALUATION = 'dcf_valuation',
  PEER_COMPARISON = 'peer_comparison',
}

export interface WorkflowConfig {
  type: WorkflowType;
  systemPrompt: string;
  model: string;
  maxTurns: number;
  maxThinkingTokens: number;
  enabledTools: string[];
}

export interface WorkflowParams {
  ticker: string;
  userPrompt?: string;
  additionalContext?: Record<string, any>;
}
```

2. `libs/agent/core/src/lib/workflows/workflow-registry.ts`:
```typescript
import { STOCK_VALUATION_FRAMEWORK } from '../prompts/framework-v2.3';
import { WorkflowType, WorkflowConfig } from './workflow.types';

// Simple key-value registry - NO switch cases!
export const WORKFLOW_CONFIGS: Record<WorkflowType, WorkflowConfig> = {
  [WorkflowType.FULL_ANALYSIS]: {
    type: WorkflowType.FULL_ANALYSIS,
    systemPrompt: STOCK_VALUATION_FRAMEWORK,
    model: 'claude-sonnet-4-20250514',
    maxTurns: 20,
    maxThinkingTokens: 10000,
    enabledTools: ['fetch_company_data', 'calculate_dcf'],
  },

  [WorkflowType.SENTIMENT]: {
    type: WorkflowType.SENTIMENT,
    systemPrompt: `You are a financial sentiment analyzer. Analyze the sentiment of recent news and social media mentions for the given stock ticker. Provide a sentiment score and key insights.`,
    model: 'claude-sonnet-4-20250514',
    maxTurns: 10,
    maxThinkingTokens: 5000,
    enabledTools: ['fetch_company_data'],
  },

  [WorkflowType.DCF_VALUATION]: {
    type: WorkflowType.DCF_VALUATION,
    systemPrompt: `You are a DCF valuation expert. Perform a detailed Discounted Cash Flow analysis for the given stock ticker. Focus on intrinsic value calculation using conservative assumptions.`,
    model: 'claude-sonnet-4-20250514',
    maxTurns: 15,
    maxThinkingTokens: 8000,
    enabledTools: ['fetch_company_data', 'calculate_dcf'],
  },

  [WorkflowType.PEER_COMPARISON]: {
    type: WorkflowType.PEER_COMPARISON,
    systemPrompt: `You are a comparative analysis expert. Compare the given stock ticker against its industry peers across key financial metrics. Identify relative strengths and weaknesses.`,
    model: 'claude-sonnet-4-20250514',
    maxTurns: 15,
    maxThinkingTokens: 7000,
    enabledTools: ['fetch_company_data'],
  },
};

// Helper function for lookup
export function getWorkflowConfig(type: WorkflowType): WorkflowConfig {
  const config = WORKFLOW_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown workflow type: ${type}`);
  }
  return config;
}
```

3. `libs/agent/core/src/lib/workflows/workflow.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { getWorkflowConfig } from './workflow-registry';
import { WorkflowType, WorkflowParams } from './workflow.types';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  buildUserPrompt(workflowType: WorkflowType, params: WorkflowParams): string {
    const config = getWorkflowConfig(workflowType);

    // Build user prompt based on workflow type
    let prompt = `Analyze ${params.ticker}`;

    if (params.userPrompt) {
      prompt += `\n\n${params.userPrompt}`;
    }

    if (params.additionalContext) {
      prompt += `\n\nAdditional context: ${JSON.stringify(params.additionalContext)}`;
    }

    this.logger.log(
      `Built prompt for workflow ${workflowType}: ${prompt.substring(0, 100)}...`
    );

    return prompt;
  }

  getConfig(workflowType: WorkflowType) {
    return getWorkflowConfig(workflowType);
  }
}
```

#### Phase 1.4: Refactor AgentService to be Stateless

**Location**: `libs/agent/core/src/lib/agent.service.ts`

**Changes**:

1. **Remove SessionManager dependency**:
```typescript
// REMOVE THIS:
constructor(
  private readonly sessionManager: SessionManagerService,
  // ...
) {}

// Replace with WorkflowService:
constructor(
  private readonly workflowService: WorkflowService,
  // ...
) {}
```

2. **Update analyzeStock signature**:
```typescript
// OLD signature (creates session internally):
async analyzeStock(
  ticker: string,
  userPrompt: string,
  options?: AnalysisOptions,
  sessionId?: string
): Promise<Observable<StreamEvent>>

// NEW signature (receives sessionId from caller):
async executeWorkflow(
  sessionId: string,
  workflowType: WorkflowType,
  params: WorkflowParams
): Promise<Observable<StreamEvent>>
```

3. **Update executeQuery method**:
```typescript
private async executeQuery(
  sessionId: string,
  workflowType: WorkflowType,
  params: WorkflowParams,
  streamToClient: boolean
): Promise<void> {
  const config = this.workflowService.getConfig(workflowType);
  const userPrompt = this.workflowService.buildUserPrompt(workflowType, params);

  const stream = query({
    prompt: userPrompt,
    options: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      maxTurns: config.maxTurns,
      maxThinkingTokens: config.maxThinkingTokens,
      permissionMode: 'bypassPermissions',
      mcpServers: {
        'stock-analyzer': this.mcpServer,
      },
    },
  });

  // Process stream as usual...
}
```

4. **Remove all session creation/management code**:
```typescript
// REMOVE THESE METHODS:
// - createSession()
// - getSession()
// - completeSession()
// - addConversation()

// Agent only receives sessionId and uses it for event emission
```

#### Phase 1.5: Update Agent API Controllers

**Location**: `libs/agent/api/src/lib/agent.controller.ts`

**Changes**:

1. **New endpoint signature**:
```typescript
// OLD:
@Post('analyze')
async analyze(
  @Body() body: { ticker: string; prompt: string }
): Promise<{ streamId: string }> {
  // Creates session internally
}

// NEW:
@Post('workflow')
async executeWorkflow(
  @Body() body: {
    sessionId: string;
    workflowType: WorkflowType;
    params: WorkflowParams;
  }
): Promise<{ sessionId: string }> {
  // Receives sessionId from Bot
  await this.agentService.executeWorkflow(
    body.sessionId,
    body.workflowType,
    body.params
  );
  return { sessionId: body.sessionId };
}
```

2. **Update SSE endpoint**:
```typescript
// SSE endpoint remains the same, just uses sessionId
@Get('stream/:sessionId')
streamAnalysis(
  @Param('sessionId') sessionId: string,
  @Res() res: Response
): void {
  // Same implementation, no changes
}
```

#### Phase 1.6: Refactor Bot to Use SessionOrchestrator

**Location**: `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Changes**:

1. **Add SessionOrchestrator dependency**:
```typescript
constructor(
  private readonly httpService: HttpService,
  private readonly streamManager: StreamManagerService,
  private readonly sessionOrchestrator: SessionOrchestrator,
) {}
```

2. **Update handleAnalyzeCommand**:
```typescript
private async handleAnalyzeCommand(ctx: Context, ticker: string) {
  const chatId = ctx.chat.id.toString();

  // Check if session already exists
  if (this.sessionOrchestrator.hasActiveSession(chatId)) {
    await ctx.reply(
      'You already have an active analysis. Use /stop to cancel it first.'
    );
    return;
  }

  // Create session in Bot
  const session = this.sessionOrchestrator.createSession(chatId, ticker);

  await ctx.reply(`Starting analysis for ${ticker}...`);

  // Call Agent with sessionId
  try {
    const response = await this.httpService.axiosRef.post(
      `${this.agentServiceUrl}/api/workflow`,
      {
        sessionId: session.sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: {
          ticker,
          userPrompt: 'Perform a comprehensive stock analysis',
        },
      }
    );

    // Start streaming
    this.streamManager.startStream(
      chatId,
      session.sessionId,
      ticker,
      ctx
    );
  } catch (error) {
    this.logger.error(`Failed to start analysis: ${error.message}`);
    await ctx.reply('Failed to start analysis. Please try again.');
    this.sessionOrchestrator.stopSession(chatId);
  }
}
```

3. **Update handleConversation**:
```typescript
private async handleConversation(ctx: Context, userMessage: string) {
  const chatId = ctx.chat.id.toString();

  // Check for completed session
  const session = this.sessionOrchestrator.getCompletedSession(chatId);
  if (!session) {
    await ctx.reply(
      'No active session. Start an analysis with /analyze TICKER'
    );
    return;
  }

  // Add user message to conversation history
  this.sessionOrchestrator.addUserMessage(chatId, userMessage);

  // Call Agent with conversation context
  try {
    const response = await this.httpService.axiosRef.post(
      `${this.agentServiceUrl}/api/workflow`,
      {
        sessionId: session.sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: {
          ticker: session.ticker,
          userPrompt: userMessage,
          additionalContext: {
            conversationHistory: this.sessionOrchestrator.getConversationHistory(chatId),
          },
        },
      }
    );

    // Stream response
    this.streamManager.startConversation(
      chatId,
      session.sessionId,
      session.ticker,
      ctx
    );
  } catch (error) {
    this.logger.error(`Failed to process conversation: ${error.message}`);
    await ctx.reply('Failed to process your question. Please try again.');
  }
}
```

4. **Update StreamManagerService**:

**Location**: `libs/bot/telegram/src/lib/stream-manager.service.ts`

```typescript
// REMOVE THIS:
private activeSessions = new Map<string, SessionInfo>();

// UPDATE handleComplete:
private async handleCompleteEvent(
  event: any,
  chatId: string,
  ctx: Context
): Promise<void> {
  // Save analysis results to SessionOrchestrator
  this.sessionOrchestrator.completeSession(
    chatId,
    event.fullAnalysis || '',
    this.streamBuffer.get(chatId) || ''
  );

  // Show completion message
  await ctx.reply('Analysis complete! Ask follow-up questions or use /analyze for a new stock.');

  // Cleanup
  this.closeStream(chatId);
}
```

#### Phase 1.7: Module Configuration

**Location**: `libs/bot/telegram/src/lib/telegram-bot.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { TelegramBotService } from './telegram-bot.service';
import { StreamManagerService } from './stream-manager.service';
import {
  SessionOrchestrator,
  InMemorySessionRepository,
} from '@stock-analyzer/bot/common';

@Module({
  imports: [HttpModule, ScheduleModule.forRoot()],
  providers: [
    TelegramBotService,
    StreamManagerService,
    SessionOrchestrator,
    {
      provide: 'ISessionRepository',
      useClass: InMemorySessionRepository,
    },
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
```

#### Phase 1.8: Remove Old SessionManager

**Location**: `libs/agent/session/`

**Action**: Delete entire library (no longer needed)

```bash
# Delete library
rm -rf libs/agent/session

# Remove from tsconfig.base.json paths
# Remove "@stock-analyzer/agent/session" entry

# Remove from any imports
# Find and replace:
# from '@stock-analyzer/agent/session' → remove
```

#### Phase 1.9: Update CLAUDE.md

Add new architecture section to CLAUDE.md:

```markdown
## Session Management Architecture

### Principle: Bot is Stateful, Agent is Stateless

**Bot (Port 3002)**:
- Owns all session state via `SessionOrchestrator`
- Creates sessions when user starts analysis
- Tracks conversation history
- Manages session lifecycle (ACTIVE → COMPLETED → EXPIRED)
- Persists session data via `ISessionRepository` interface

**Agent (Port 3001)**:
- Completely stateless
- Receives `sessionId` from Bot in every request
- Executes workflows based on `WorkflowType` enum
- Returns SSE stream with events
- Never creates or manages sessions

**Workflow Registry**:
```typescript
// Key-value registry (NO switch cases)
export const WORKFLOW_CONFIGS: Record<WorkflowType, WorkflowConfig> = {
  [WorkflowType.FULL_ANALYSIS]: { /* config */ },
  [WorkflowType.SENTIMENT]: { /* config */ },
  [WorkflowType.DCF_VALUATION]: { /* config */ },
};

// Usage: Simple lookup
const config = WORKFLOW_CONFIGS[workflowType];
```

**Pluggable Storage**:
```typescript
// Phase 1: In-memory
useClass: InMemorySessionRepository

// Phase 2: Redis (multi-instance support)
useClass: RedisSessionRepository

// Phase 3: PostgreSQL (full persistence)
useClass: PostgreSQLSessionRepository
```

### Session Lifecycle

```
User: /analyze AAPL
  ↓
Bot creates session (ACTIVE)
  ↓
Bot POSTs to Agent with sessionId
  ↓
Agent executes workflow, streams results
  ↓
Bot receives stream, displays to user
  ↓
Bot marks session as COMPLETED
  ↓
User asks follow-up question
  ↓
Bot routes to conversation mode
  ↓
Bot POSTs to Agent with sessionId + conversation history
  ↓
Agent responds with context-aware answer
  ↓
Bot adds Q&A to conversation history
```

### Adding New Workflows

1. Add enum value to `WorkflowType`
2. Add config to `WORKFLOW_CONFIGS` registry
3. Create slash command in Bot (e.g., `/sentiment TICKER`)
4. Done! No changes to Agent needed.
```

---

### Phase 2: Redis Migration (Multi-Instance Support)

**Goal**: Replace in-memory storage with Redis for multi-instance deployments.

#### Phase 2.1: Create RedisSessionRepository

**Location**: `libs/bot/common/src/lib/session-store/repositories/redis-session.repository.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  ISessionRepository,
  AnalysisSession,
  SessionStatus,
  ConversationMessage,
} from '../interfaces';

@Injectable()
export class RedisSessionRepository implements ISessionRepository {
  private readonly logger = new Logger(RedisSessionRepository.name);
  private readonly redis: Redis;
  private readonly KEY_PREFIX = 'session:';
  private readonly SESSION_TTL = 3600; // 1 hour in seconds

  constructor() {
    // TODO: Get Redis config from environment
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, {
      // TODO: Add retry strategy
      // TODO: Add connection error handling
      // TODO: Add health checks
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });
  }

  private getKey(chatId: string): string {
    return `${this.KEY_PREFIX}${chatId}`;
  }

  async createSession(chatId: string, ticker: string): Promise<AnalysisSession> {
    const session: AnalysisSession = {
      chatId,
      sessionId: uuidv4(),
      ticker,
      status: SessionStatus.ACTIVE,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      conversationHistory: [],
    };

    // TODO: Add error handling
    await this.redis.setex(
      this.getKey(chatId),
      this.SESSION_TTL,
      JSON.stringify(session)
    );

    return session;
  }

  async getSession(chatId: string): Promise<AnalysisSession | null> {
    // TODO: Add error handling
    const data = await this.redis.get(this.getKey(chatId));
    if (!data) return null;

    // TODO: Add schema validation
    const session = JSON.parse(data);

    // Deserialize dates
    session.createdAt = new Date(session.createdAt);
    session.lastActivityAt = new Date(session.lastActivityAt);
    if (session.completedAt) {
      session.completedAt = new Date(session.completedAt);
    }

    return session;
  }

  async updateSessionStatus(chatId: string, status: SessionStatus): Promise<void> {
    // TODO: Implement atomic update using Lua script
    // TODO: Add error handling
    const session = await this.getSession(chatId);
    if (!session) return;

    session.status = status;
    session.lastActivityAt = new Date();

    if (status === SessionStatus.COMPLETED) {
      session.completedAt = new Date();
    }

    await this.redis.setex(
      this.getKey(chatId),
      this.SESSION_TTL,
      JSON.stringify(session)
    );
  }

  async deleteSession(chatId: string): Promise<void> {
    // TODO: Add error handling
    await this.redis.del(this.getKey(chatId));
  }

  async saveAnalysisResults(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): Promise<void> {
    // TODO: Implement atomic update using Lua script
    // TODO: Add error handling
    const session = await this.getSession(chatId);
    if (!session) return;

    session.fullAnalysis = fullAnalysis;
    session.executiveSummary = executiveSummary;
    session.status = SessionStatus.COMPLETED;
    session.completedAt = new Date();
    session.lastActivityAt = new Date();

    await this.redis.setex(
      this.getKey(chatId),
      this.SESSION_TTL,
      JSON.stringify(session)
    );
  }

  async addConversationMessage(
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    // TODO: Implement atomic update using Lua script
    // TODO: Consider storing conversation separately for better performance
    // TODO: Add error handling
    const session = await this.getSession(chatId);
    if (!session) return;

    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    session.lastActivityAt = new Date();

    await this.redis.setex(
      this.getKey(chatId),
      this.SESSION_TTL,
      JSON.stringify(session)
    );
  }

  async getConversationHistory(chatId: string): Promise<ConversationMessage[]> {
    const session = await this.getSession(chatId);
    return session?.conversationHistory || [];
  }

  async cleanupExpiredSessions(expiryDurationMs: number): Promise<number> {
    // TODO: Implement using Redis SCAN + pipeline for efficient cleanup
    // TODO: Add error handling
    // Redis TTL handles most cleanup automatically
    // This method can be used for manual cleanup or status updates
    this.logger.log('Redis TTL handles automatic expiration');
    return 0;
  }

  async getAllActiveSessions(): Promise<AnalysisSession[]> {
    // TODO: Implement using Redis SCAN (don't use KEYS in production!)
    // TODO: Add pagination support
    // TODO: Add error handling
    this.logger.warn('getAllActiveSessions not fully implemented for Redis');
    return [];
  }

  async getSessionsByStatus(status: SessionStatus): Promise<AnalysisSession[]> {
    // TODO: Implement using Redis secondary index (sorted sets)
    // TODO: Consider maintaining status index separately
    // TODO: Add error handling
    this.logger.warn('getSessionsByStatus not fully implemented for Redis');
    return [];
  }

  // TODO: Add connection health check method
  // TODO: Add reconnection logic
  // TODO: Add metrics (cache hits, misses, latency)
}
```

#### Phase 2.2: Update Module Configuration

**Location**: `libs/bot/telegram/src/lib/telegram-bot.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  SessionOrchestrator,
  InMemorySessionRepository,
  RedisSessionRepository,
} from '@stock-analyzer/bot/common';

@Module({
  imports: [HttpModule, ScheduleModule.forRoot(), ConfigModule],
  providers: [
    TelegramBotService,
    StreamManagerService,
    SessionOrchestrator,
    {
      provide: 'ISessionRepository',
      useFactory: (configService: ConfigService) => {
        const storageType = configService.get('SESSION_STORAGE_TYPE', 'memory');

        switch (storageType) {
          case 'redis':
            return new RedisSessionRepository();
          case 'memory':
          default:
            return new InMemorySessionRepository();
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
```

#### Phase 2.3: Environment Configuration

```bash
# .env
SESSION_STORAGE_TYPE=redis
REDIS_URL=redis://localhost:6379

# Railway environment variables
SESSION_STORAGE_TYPE=redis
REDIS_URL=redis://:password@redis-instance:6379
```

#### Phase 2.4: Testing Strategy

**TODO**: Create comprehensive test suite:

1. **Unit Tests** (`redis-session.repository.spec.ts`):
   - Test each repository method
   - Mock Redis client
   - Verify serialization/deserialization
   - Test error handling

2. **Integration Tests** (`redis-session.repository.integration.spec.ts`):
   - Use real Redis (docker-compose)
   - Test concurrent operations
   - Test session expiration
   - Test reconnection logic

3. **Load Tests**:
   - Simulate 1000+ concurrent sessions
   - Measure Redis memory usage
   - Measure operation latency
   - Test Redis failover

#### Phase 2.5: Rollback Plan

If Redis migration fails:

1. Set `SESSION_STORAGE_TYPE=memory` in environment
2. Restart bot service
3. System falls back to in-memory storage
4. No code changes needed (thanks to interface!)

---

### Phase 3: PostgreSQL Persistence (Full Persistence)

**Goal**: Add PostgreSQL backend for full persistence and analytics.

#### Phase 3.1: Create Database Schema

**Location**: `libs/bot/common/src/lib/session-store/migrations/001_create_sessions.sql`

```sql
-- TODO: Design complete schema

CREATE TABLE sessions (
  chat_id VARCHAR(255) PRIMARY KEY,
  session_id UUID NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  full_analysis TEXT,
  executive_summary TEXT,

  -- Indexes for common queries
  INDEX idx_status (status),
  INDEX idx_ticker (ticker),
  INDEX idx_created_at (created_at),
  INDEX idx_last_activity_at (last_activity_at)
);

CREATE TABLE conversation_messages (
  id SERIAL PRIMARY KEY,
  chat_id VARCHAR(255) NOT NULL REFERENCES sessions(chat_id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,

  INDEX idx_chat_id (chat_id),
  INDEX idx_timestamp (timestamp)
);

-- TODO: Add analytics tables
-- TODO: Add indexes for analytics queries
-- TODO: Add partitioning strategy for large datasets
```

#### Phase 3.2: Create PostgreSQLSessionRepository

**Location**: `libs/bot/common/src/lib/session-store/repositories/postgresql-session.repository.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  ISessionRepository,
  AnalysisSession,
  SessionStatus,
  ConversationMessage,
} from '../interfaces';

@Injectable()
export class PostgreSQLSessionRepository implements ISessionRepository {
  private readonly logger = new Logger(PostgreSQLSessionRepository.name);
  private readonly pool: Pool;

  constructor() {
    // TODO: Get database config from environment
    // TODO: Add connection pooling configuration
    // TODO: Add health checks
    // TODO: Add retry logic
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // TODO: Configure pool size based on load
      // TODO: Add connection timeout
      // TODO: Add idle timeout
    });
  }

  async createSession(chatId: string, ticker: string): Promise<AnalysisSession> {
    // TODO: Implement full database insert
    // TODO: Add error handling
    // TODO: Add transaction support
    this.logger.warn('PostgreSQL repository not fully implemented');
    throw new Error('Not implemented');
  }

  async getSession(chatId: string): Promise<AnalysisSession | null> {
    // TODO: Implement full database query
    // TODO: Join with conversation_messages table
    // TODO: Add error handling
    // TODO: Add caching layer (Redis?)
    this.logger.warn('PostgreSQL repository not fully implemented');
    return null;
  }

  async updateSessionStatus(chatId: string, status: SessionStatus): Promise<void> {
    // TODO: Implement atomic update
    // TODO: Add optimistic locking
    // TODO: Add error handling
    this.logger.warn('PostgreSQL repository not fully implemented');
  }

  async deleteSession(chatId: string): Promise<void> {
    // TODO: Implement soft delete (set status to DELETED)
    // TODO: Or hard delete with CASCADE
    // TODO: Add error handling
    this.logger.warn('PostgreSQL repository not fully implemented');
  }

  async saveAnalysisResults(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): Promise<void> {
    // TODO: Implement full update
    // TODO: Consider storing analysis in separate table
    // TODO: Add compression for large analysis texts
    // TODO: Add error handling
    this.logger.warn('PostgreSQL repository not fully implemented');
  }

  async addConversationMessage(
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    // TODO: Implement insert into conversation_messages
    // TODO: Add error handling
    // TODO: Add transaction support
    this.logger.warn('PostgreSQL repository not fully implemented');
  }

  async getConversationHistory(chatId: string): Promise<ConversationMessage[]> {
    // TODO: Implement query with ORDER BY timestamp
    // TODO: Add pagination support
    // TODO: Add error handling
    this.logger.warn('PostgreSQL repository not fully implemented');
    return [];
  }

  async cleanupExpiredSessions(expiryDurationMs: number): Promise<number> {
    // TODO: Implement batch update/delete
    // TODO: Use database-side scheduling (cron job)
    // TODO: Add error handling
    this.logger.warn('PostgreSQL repository not fully implemented');
    return 0;
  }

  async getAllActiveSessions(): Promise<AnalysisSession[]> {
    // TODO: Implement query with pagination
    // TODO: Add caching
    // TODO: Add error handling
    this.logger.warn('PostgreSQL repository not fully implemented');
    return [];
  }

  async getSessionsByStatus(status: SessionStatus): Promise<AnalysisSession[]> {
    // TODO: Implement query with index usage
    // TODO: Add pagination
    // TODO: Add error handling
    this.logger.warn('PostgreSQL repository not fully implemented');
    return [];
  }

  // TODO: Add analytics methods
  // - getSessionStats(startDate, endDate)
  // - getPopularTickers()
  // - getAverageSessionDuration()
  // - getUserEngagementMetrics()
}
```

#### Phase 3.3: Migration Strategy

**TODO**: Plan migration from Redis to PostgreSQL:

1. **Dual-Write Pattern**:
   - Write to both Redis and PostgreSQL
   - Read from Redis (fast)
   - PostgreSQL as backup and analytics source

2. **Gradual Cutover**:
   - Start writing to PostgreSQL
   - Monitor for errors/performance issues
   - After validation period, switch reads to PostgreSQL
   - Keep Redis as cache layer

3. **Rollback Plan**:
   - If PostgreSQL fails, switch back to Redis-only
   - Keep dual-write for safety during transition

#### Phase 3.4: Analytics Capabilities

**TODO**: Build analytics dashboard on top of PostgreSQL:

1. **Session Analytics**:
   - Total sessions per day/week/month
   - Average session duration
   - Completion rate (ACTIVE → COMPLETED vs STOPPED)

2. **Ticker Analytics**:
   - Most analyzed tickers
   - Average analysis time per ticker
   - Ticker popularity trends

3. **User Analytics**:
   - Active users (DAU/MAU)
   - User retention (return rate)
   - Average questions per session

4. **Conversation Analytics**:
   - Average conversation length
   - Most common follow-up questions
   - Question categories (valuation, sentiment, metrics, etc.)

---

## Testing Strategy

### Unit Tests

**Phase 1 Unit Tests** (create immediately):

1. `in-memory-session.repository.spec.ts`:
   - Test all CRUD operations
   - Test session lifecycle transitions
   - Test conversation history management
   - Test cleanup logic

2. `session-orchestrator.service.spec.ts`:
   - Test session creation
   - Test status queries
   - Test conversation methods
   - Mock repository

3. `workflow-registry.spec.ts`:
   - Test workflow lookup
   - Test invalid workflow type handling

4. `workflow.service.spec.ts`:
   - Test prompt building
   - Test config retrieval

### Integration Tests

**Phase 1 Integration Tests**:

1. `bot-agent-integration.spec.ts`:
   - Test full analysis flow (Bot → Agent → Bot)
   - Test conversation flow
   - Test session lifecycle
   - Use real HTTP calls (test environment)

**Phase 2 Integration Tests** (TODO):

1. `redis-integration.spec.ts`:
   - Test Redis repository with real Redis instance
   - Test concurrent operations
   - Test expiration
   - Use docker-compose for Redis

**Phase 3 Integration Tests** (TODO):

1. `postgresql-integration.spec.ts`:
   - Test PostgreSQL repository with real database
   - Test transactions
   - Test concurrent updates
   - Use docker-compose for PostgreSQL

### E2E Tests

**Phase 1 E2E Tests**:

1. `telegram-bot-e2e.spec.ts`:
   - Simulate full user journey
   - Test `/analyze` command
   - Test follow-up questions
   - Test `/stop` command
   - Use mock Telegram API

---

## Rollback Plan

### Phase 1 Rollback (Bot-Owned Sessions)

If Phase 1 causes issues:

1. Revert Git commits (keep old SessionManagerService)
2. Restore Agent-owned session architecture
3. Remove SessionOrchestrator from Bot

**Risk**: Low (in-memory storage is simple)

### Phase 2 Rollback (Redis)

If Redis causes issues:

1. Set `SESSION_STORAGE_TYPE=memory` in environment
2. Restart bot service
3. No code changes needed!

**Risk**: Medium (Redis connectivity issues)

### Phase 3 Rollback (PostgreSQL)

If PostgreSQL causes issues:

1. Set `SESSION_STORAGE_TYPE=redis` in environment
2. Restart bot service
3. No code changes needed!

**Risk**: Medium (Database schema changes may be hard to revert)

---

## Success Criteria

### Phase 1 Success Criteria

- [ ] Bot creates sessions, Agent receives sessionId
- [ ] Agent is fully stateless (no SessionManager dependency)
- [ ] Workflows use registry pattern (NO switch cases)
- [ ] All existing features work (analyze, conversation, stop)
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] CLAUDE.md updated with new architecture

### Phase 2 Success Criteria (TODO)

- [ ] Redis repository implements full ISessionRepository interface
- [ ] Sessions persist across bot restarts
- [ ] Multiple bot instances can share sessions
- [ ] Performance is acceptable (< 100ms per operation)
- [ ] Integration tests pass with real Redis
- [ ] Rollback to in-memory works seamlessly

### Phase 3 Success Criteria (TODO)

- [ ] PostgreSQL repository implements full ISessionRepository interface
- [ ] Sessions survive Redis failures
- [ ] Analytics queries work efficiently
- [ ] Historical data is preserved
- [ ] Integration tests pass with real PostgreSQL
- [ ] Rollback to Redis works seamlessly

---

## Timeline Estimate

**Phase 1** (Bot-Owned Sessions): 2-3 days
- Day 1: Create interfaces, repositories, orchestrator
- Day 2: Refactor Agent and Bot
- Day 3: Testing, cleanup, documentation

**Phase 2** (Redis): 1-2 days (TODO)
- Day 1: Implement Redis repository
- Day 2: Testing, monitoring, cutover

**Phase 3** (PostgreSQL): 3-5 days (TODO)
- Day 1: Schema design, migration scripts
- Day 2-3: Implement PostgreSQL repository
- Day 4: Analytics queries, dashboard
- Day 5: Testing, monitoring, cutover

**Total**: 6-10 days for all three phases

---

## Next Steps

1. Review this migration plan
2. Create Phase 1 libraries and interfaces
3. Implement InMemorySessionRepository
4. Create SessionOrchestrator
5. Create WorkflowRegistry
6. Refactor AgentService
7. Refactor Bot
8. Write unit tests
9. Write integration tests
10. Update CLAUDE.md
11. Deploy Phase 1
12. Monitor production
13. Plan Phase 2 (Redis) after Phase 1 is stable

---

## Questions for Review

1. Should conversation history be stored separately from session data in Redis/PostgreSQL for better performance?
2. What TTL should we use for Redis sessions? (currently 1 hour)
3. Should we implement soft delete or hard delete for sessions?
4. Do we need a separate analytics service or can we query PostgreSQL directly?
5. Should we add rate limiting per user/session?
6. Should we add session export functionality (for debugging/support)?

---

## Additional Considerations

### Security

- [ ] Add authentication/authorization for Agent API endpoints
- [ ] Sanitize user input before storing in database
- [ ] Encrypt sensitive data in database (if needed)
- [ ] Add rate limiting per user
- [ ] Add request validation middleware

### Monitoring

- [ ] Add metrics for session operations (create, update, delete)
- [ ] Add alerts for failed operations
- [ ] Add dashboard for session statistics
- [ ] Add logging for all session lifecycle events
- [ ] Add distributed tracing (OpenTelemetry?)

### Performance

- [ ] Add caching layer (Redis for PostgreSQL)
- [ ] Add database connection pooling
- [ ] Add database query optimization
- [ ] Add pagination for large result sets
- [ ] Add batch operations for bulk updates

### Scalability

- [ ] Design for horizontal scaling (multiple bot instances)
- [ ] Design for database sharding (if needed)
- [ ] Design for Redis clustering (if needed)
- [ ] Add load balancing for Agent service
- [ ] Add circuit breaker pattern for external dependencies
