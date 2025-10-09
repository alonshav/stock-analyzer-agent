# Stock Analyzer Agent Refactor: Implementation Plan

## Executive Summary

This plan implements three major architectural improvements:

1. **Complete Agent SDK Streaming** - Leverage all SDK capabilities (hooks, all message types)
2. **Smart Session Management** - Enable conversational continuity with context awareness
3. **Integrated Architecture** - Combine streaming + sessions + hooks for intelligent real-time agent

**Approach**: Test-driven refactor without backward compatibility constraints.

---

## Architecture Overview

### Current State

```
User → Telegram Bot → Agent (SSE) → Anthropic SDK → Tools
                          ↓
                    EventEmitter
                          ↓
                    SSE Controller → Telegram Bot (updates UI)
```

**Limitations**:
- No session management (no conversation memory)
- Missing SDK message types (ignores thinking, errors)
- No hooks (no interception, validation, enhancement)
- Single-query only (can't do follow-ups)
- Limited event granularity

### Target State

```
User → Telegram Bot → Agent (SSE) → SDK with Hooks → Tools
         ↓                ↓              ↓
    Session Manager  Stream Manager  Hooks Service
         ↓                ↓              ↓
    Context Builder  Event Emitter  Validation/Enhancement
         ↓                ↓              ↓
    SSE Controller ← All Events ← Session Metadata
         ↓
    Telegram Bot (context-aware UI)
```

**Capabilities**:
- ✅ Session-based conversations (1-hour memory)
- ✅ Full SDK message type support
- ✅ Hooks for validation, budgets, caching
- ✅ Two modes: Workflow (new analysis) + Conversation (follow-ups)
- ✅ Granular streaming events with session context
- ✅ Cross-session comparisons

---

## Phase 1: Foundation & Testing Infrastructure

**Duration**: 3-4 days

### 1.1 Create Test Infrastructure

**Goal**: Build comprehensive testing utilities before refactoring

**Create Mock Utilities**:

```typescript
// libs/agent/core/src/test-utils/mock-sdk-stream.ts
export class MockSDKStream {
  static createAssistantMessage(text: string)
  static createThinkingMessage(content: string)
  static createToolUseMessage(name: string, input: any)
  static createToolResultMessage(toolId: string, result: any)
  static createErrorMessage(message: string)

  static createFullStream(scenario: 'success' | 'error' | 'with-tools')
}

// libs/agent/core/src/test-utils/mock-session.ts
export class MockSessionManager {
  createTestSession(ticker: string, chatId: string)
  createActiveSession(ticker: string, chatId: string)
  createExpiredSession(ticker: string, chatId: string)
  createSessionWithHistory(messages: Array)
}

// libs/bot/telegram/src/test-utils/mock-telegram.ts
export class MockTelegramContext {
  createContext(chatId: string, message: string)
  createCallbackQuery(data: string)
  captureReplies(): Array<string>
  captureSentDocuments(): Array<Buffer>
}
```

**Create Test Fixtures**:

```typescript
// test-fixtures/sample-data.ts
export const SAMPLE_COMPANY_DATA = { /* FMP response */ }
export const SAMPLE_ANALYSIS_STREAM = [ /* SDK messages */ ]
export const SAMPLE_SESSION = { /* Session object */ }
```

**Acceptance Criteria**:
- Mock SDK streams work with for...await
- Mock sessions behave like real sessions
- Mock Telegram context captures all interactions
- All fixtures are realistic and comprehensive

### 1.2 Baseline Tests for Current System

**Goal**: Document current behavior before changing it

**Test Files to Create**:

```bash
libs/agent/core/src/lib/agent.service.spec.ts          # Core agent tests
libs/agent/core/src/lib/stream.service.spec.ts         # Stream service tests
libs/bot/telegram/src/lib/telegram-bot.service.spec.ts # Bot tests
libs/bot/telegram/src/lib/stream-manager.service.spec.ts # Bot stream tests
```

**Key Test Cases**:

```typescript
// agent.service.spec.ts
describe('AgentService - Baseline', () => {
  it('should analyze stock and return result')
  it('should emit chunk events during streaming')
  it('should emit tool events when tools are called')
  it('should emit complete event at end')
  it('should handle SDK errors gracefully')
  it('should process assistant messages')
  it('should process user/tool_result messages')
})

// telegram-bot.service.spec.ts
describe('TelegramBotService - Baseline', () => {
  it('should handle /analyze command')
  it('should handle /stop command')
  it('should recognize ticker patterns')
  it('should reject invalid tickers')
  it('should prevent concurrent analyses')
})

// stream-manager.service.spec.ts
describe('StreamManagerService - Baseline', () => {
  it('should connect to SSE endpoint')
  it('should process chunk events')
  it('should process tool events')
  it('should process PDF events')
  it('should update Telegram messages')
  it('should handle connection errors')
})
```

**Acceptance Criteria**:
- All baseline tests pass
- Coverage ≥ 60% on core services
- Tests run in < 15 seconds
- No flaky tests (10 consecutive runs)

---

## Phase 2: Session Management

**Duration**: 5-6 days

### 2.1 Create Session Library

**Generate Library**:
```bash
nx g @nx/nest:library session-manager --directory=libs/agent/session --no-interactive
```

**File Structure**:
```
libs/agent/session/
├── src/
│   ├── lib/
│   │   ├── session-manager.service.ts
│   │   ├── session-manager.service.spec.ts
│   │   ├── interfaces/
│   │   │   ├── analysis-session.interface.ts
│   │   │   └── conversation-message.interface.ts
│   │   └── utils/
│   │       ├── context-builder.ts
│   │       └── context-builder.spec.ts
│   └── index.ts
```

### 2.2 Define Session Interfaces

**Location**: `libs/agent/session/src/lib/interfaces/analysis-session.interface.ts`

```typescript
export interface AnalysisSession {
  sessionId: string;           // "AAPL-1234567890"
  ticker: string;              // "AAPL"
  chatId: string;              // Telegram chat ID
  status: 'active' | 'completed' | 'stopped' | 'expired';

  // Timestamps
  startedAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  completedAt?: Date;

  // Analysis results
  fullAnalysis?: string;
  executiveSummary?: string;

  // Conversation history
  conversationHistory: ConversationMessage[];

  // Metrics
  metrics: {
    tokens: number;
    toolCalls: number;
    turns: number;
    errors: number;
  };
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

### 2.3 TDD: SessionManagerService

**Test-First Approach**: Write tests before implementation

**Test File**: `libs/agent/session/src/lib/session-manager.service.spec.ts`

```typescript
describe('SessionManagerService', () => {
  let service: SessionManagerService;

  beforeEach(() => {
    service = new SessionManagerService();
  });

  describe('createSession', () => {
    it('should create new session with unique ID', () => {
      const session = service.createSession('chat1', 'AAPL');
      expect(session.sessionId).toMatch(/^AAPL-\d+$/);
      expect(session.ticker).toBe('AAPL');
      expect(session.chatId).toBe('chat1');
      expect(session.status).toBe('active');
    });

    it('should set expiration to 1 hour from now', () => {
      const session = service.createSession('chat1', 'AAPL');
      const expectedExpiry = Date.now() + 3600000;
      expect(session.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3);
    });

    it('should initialize empty conversation history', () => {
      const session = service.createSession('chat1', 'AAPL');
      expect(session.conversationHistory).toEqual([]);
    });

    it('should initialize metrics at zero', () => {
      const session = service.createSession('chat1', 'AAPL');
      expect(session.metrics).toEqual({
        tokens: 0,
        toolCalls: 0,
        turns: 0,
        errors: 0
      });
    });
  });

  describe('getActiveSession', () => {
    it('should return active session for chatId', () => {
      const created = service.createSession('chat1', 'AAPL');
      const retrieved = service.getActiveSession('chat1');
      expect(retrieved).toEqual(created);
    });

    it('should return null when no session exists', () => {
      const retrieved = service.getActiveSession('chat999');
      expect(retrieved).toBeNull();
    });

    it('should return null for expired sessions', () => {
      const session = service.createSession('chat1', 'AAPL');
      // Manually expire the session
      session.expiresAt = new Date(Date.now() - 1000);
      service['sessions'].set('chat1', [session]);

      const retrieved = service.getActiveSession('chat1');
      expect(retrieved).toBeNull();
    });

    it('should return null for completed sessions', () => {
      const session = service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full analysis', 'Summary');

      const retrieved = service.getActiveSession('chat1');
      expect(retrieved).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should add user message to conversation history', () => {
      service.createSession('chat1', 'AAPL');
      service.addMessage('chat1', 'user', 'What is the P/E ratio?');

      const session = service.getActiveSession('chat1')!;
      expect(session.conversationHistory).toHaveLength(1);
      expect(session.conversationHistory[0]).toMatchObject({
        role: 'user',
        content: 'What is the P/E ratio?'
      });
    });

    it('should add assistant message to conversation history', () => {
      service.createSession('chat1', 'AAPL');
      service.addMessage('chat1', 'assistant', 'The P/E ratio is 28.5');

      const session = service.getActiveSession('chat1')!;
      expect(session.conversationHistory[0].role).toBe('assistant');
    });

    it('should update lastActivity timestamp', () => {
      service.createSession('chat1', 'AAPL');
      const beforeTime = Date.now();
      service.addMessage('chat1', 'user', 'Hello');
      const afterTime = Date.now();

      const session = service.getActiveSession('chat1')!;
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(session.lastActivity.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should throw when session does not exist', () => {
      expect(() => {
        service.addMessage('chat999', 'user', 'Hello');
      }).toThrow('No active session');
    });
  });

  describe('buildContextPrompt', () => {
    it('should include active session analysis', () => {
      const session = service.createSession('chat1', 'AAPL');
      session.executiveSummary = 'Apple shows strong fundamentals...';

      const prompt = service.buildContextPrompt('chat1', 'What is the P/E?');

      expect(prompt).toContain('AAPL Analysis');
      expect(prompt).toContain('Apple shows strong fundamentals');
    });

    it('should include conversation history', () => {
      service.createSession('chat1', 'AAPL');
      service.addMessage('chat1', 'user', 'First question');
      service.addMessage('chat1', 'assistant', 'First answer');

      const prompt = service.buildContextPrompt('chat1', 'Second question');

      expect(prompt).toContain('First question');
      expect(prompt).toContain('First answer');
      expect(prompt).toContain('Second question');
    });

    it('should include recent sessions for comparison', () => {
      // Create and complete AAPL session
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'AAPL analysis', 'AAPL summary');

      // Create active MSFT session
      service.createSession('chat1', 'MSFT');

      const prompt = service.buildContextPrompt('chat1', 'Compare to Apple');

      expect(prompt).toContain('AAPL Analysis');
      expect(prompt).toContain('MSFT Analysis');
    });

    it('should limit to last 5 sessions', () => {
      // Create 6 sessions
      for (let i = 1; i <= 6; i++) {
        service.createSession('chat1', `TICK${i}`);
        service.completeSession('chat1', `Analysis ${i}`, `Summary ${i}`);
      }

      const prompt = service.buildContextPrompt('chat1', 'Question');

      // Should NOT include TICK1 (oldest)
      expect(prompt).not.toContain('TICK1');
      // Should include TICK2-TICK6 (last 5)
      expect(prompt).toContain('TICK6');
      expect(prompt).toContain('TICK2');
    });
  });

  describe('completeSession', () => {
    it('should save analysis results', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full analysis text', 'Summary text');

      const session = service['sessions'].get('chat1')![0];
      expect(session.fullAnalysis).toBe('Full analysis text');
      expect(session.executiveSummary).toBe('Summary text');
    });

    it('should set status to completed', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full', 'Summary');

      const session = service['sessions'].get('chat1')![0];
      expect(session.status).toBe('completed');
    });

    it('should set completedAt timestamp', () => {
      service.createSession('chat1', 'AAPL');
      const beforeTime = Date.now();
      service.completeSession('chat1', 'Full', 'Summary');
      const afterTime = Date.now();

      const session = service['sessions'].get('chat1')![0];
      expect(session.completedAt!.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(session.completedAt!.getTime()).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('stopSession', () => {
    it('should set status to stopped', () => {
      service.createSession('chat1', 'AAPL');
      service.stopSession('chat1');

      const session = service['sessions'].get('chat1')![0];
      expect(session.status).toBe('stopped');
    });

    it('should return false when no active session', () => {
      const result = service.stopSession('chat999');
      expect(result).toBe(false);
    });
  });

  describe('addMetric', () => {
    it('should increment token count', () => {
      service.createSession('chat1', 'AAPL');
      service.addMetric('chat1', 'tokens', 1500);
      service.addMetric('chat1', 'tokens', 800);

      const session = service.getActiveSession('chat1')!;
      expect(session.metrics.tokens).toBe(2300);
    });

    it('should increment tool call count', () => {
      service.createSession('chat1', 'AAPL');
      service.addMetric('chat1', 'toolCalls', 1);
      service.addMetric('chat1', 'toolCalls', 1);

      const session = service.getActiveSession('chat1')!;
      expect(session.metrics.toolCalls).toBe(2);
    });
  });

  describe('getRecentSessions', () => {
    it('should return sessions sorted by recency', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'A1', 'S1');

      service.createSession('chat1', 'MSFT');
      service.completeSession('chat1', 'A2', 'S2');

      const recent = service.getRecentSessions('chat1');
      expect(recent[0].ticker).toBe('MSFT');
      expect(recent[1].ticker).toBe('AAPL');
    });

    it('should limit to specified count', () => {
      for (let i = 1; i <= 10; i++) {
        service.createSession('chat1', `TICK${i}`);
        service.completeSession('chat1', 'A', 'S');
      }

      const recent = service.getRecentSessions('chat1', 3);
      expect(recent).toHaveLength(3);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', () => {
      const session = service.createSession('chat1', 'AAPL');
      session.expiresAt = new Date(Date.now() - 1000);

      service.cleanupExpiredSessions();

      const sessions = service['sessions'].get('chat1');
      expect(sessions).toBeUndefined();
    });

    it('should not remove active sessions', () => {
      service.createSession('chat1', 'AAPL');
      service.cleanupExpiredSessions();

      const session = service.getActiveSession('chat1');
      expect(session).not.toBeNull();
    });

    it('should run automatically every 5 minutes', async () => {
      jest.useFakeTimers();
      const cleanupSpy = jest.spyOn(service, 'cleanupExpiredSessions');

      // Trigger interval
      jest.advanceTimersByTime(300000); // 5 minutes

      expect(cleanupSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
```

### 2.4 Implement SessionManagerService

**Location**: `libs/agent/session/src/lib/session-manager.service.ts`

**Implementation** (write to make tests pass):

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AnalysisSession, ConversationMessage } from './interfaces';

@Injectable()
export class SessionManagerService implements OnModuleInit {
  private readonly logger = new Logger(SessionManagerService.name);
  private readonly sessions = new Map<string, AnalysisSession[]>();
  private readonly SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour
  private readonly MAX_SESSIONS_PER_CHAT = 5;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private cleanupTimer?: NodeJS.Timeout;

  onModuleInit() {
    // Start automatic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL);
  }

  createSession(chatId: string, ticker: string): AnalysisSession {
    const sessionId = `${ticker}-${Date.now()}`;
    const now = new Date();

    const session: AnalysisSession = {
      sessionId,
      ticker,
      chatId,
      status: 'active',
      startedAt: now,
      lastActivity: now,
      expiresAt: new Date(now.getTime() + this.SESSION_TIMEOUT),
      conversationHistory: [],
      metrics: {
        tokens: 0,
        toolCalls: 0,
        turns: 0,
        errors: 0,
      },
    };

    // Add to sessions list for this chat
    const chatSessions = this.sessions.get(chatId) || [];
    chatSessions.push(session);

    // Keep only last MAX_SESSIONS_PER_CHAT
    if (chatSessions.length > this.MAX_SESSIONS_PER_CHAT) {
      chatSessions.shift();
    }

    this.sessions.set(chatId, chatSessions);

    this.logger.log(`Created session ${sessionId} for ${ticker} (chat: ${chatId})`);
    return session;
  }

  getActiveSession(chatId: string): AnalysisSession | null {
    const chatSessions = this.sessions.get(chatId);
    if (!chatSessions) return null;

    // Find most recent active session
    const activeSession = chatSessions
      .reverse()
      .find(s => s.status === 'active' && s.expiresAt > new Date());

    return activeSession || null;
  }

  getRecentSessions(chatId: string, limit = 5): AnalysisSession[] {
    const chatSessions = this.sessions.get(chatId);
    if (!chatSessions) return [];

    return chatSessions
      .filter(s => s.status === 'completed')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  addMessage(chatId: string, role: 'user' | 'assistant', content: string): void {
    const session = this.getActiveSession(chatId);
    if (!session) {
      throw new Error(`No active session for chat ${chatId}`);
    }

    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    session.lastActivity = new Date();
  }

  addMetric(chatId: string, metric: keyof AnalysisSession['metrics'], value: number): void {
    const session = this.getActiveSession(chatId);
    if (!session) return;

    session.metrics[metric] += value;
  }

  completeSession(chatId: string, fullAnalysis: string, executiveSummary: string): void {
    const session = this.getActiveSession(chatId);
    if (!session) {
      throw new Error(`No active session for chat ${chatId}`);
    }

    session.status = 'completed';
    session.fullAnalysis = fullAnalysis;
    session.executiveSummary = executiveSummary;
    session.completedAt = new Date();

    this.logger.log(`Completed session ${session.sessionId}`);
  }

  stopSession(chatId: string): boolean {
    const session = this.getActiveSession(chatId);
    if (!session) return false;

    session.status = 'stopped';
    this.logger.log(`Stopped session ${session.sessionId}`);
    return true;
  }

  buildContextPrompt(chatId: string, newMessage: string): string {
    const activeSession = this.getActiveSession(chatId);
    if (!activeSession) {
      throw new Error(`No active session for chat ${chatId}`);
    }

    const recentSessions = this.getRecentSessions(chatId, 5);

    let prompt = '';

    // Add recent sessions for comparison
    if (recentSessions.length > 0) {
      prompt += 'Recent analysis sessions (for reference):\n\n';
      for (const session of recentSessions) {
        prompt += `--- ${session.ticker} Analysis ---\n`;
        prompt += `${session.executiveSummary || 'Analysis in progress...'}\n\n`;
      }
    }

    // Add current session context
    prompt += `Current conversation about ${activeSession.ticker}:\n\n`;

    // Add conversation history
    for (const msg of activeSession.conversationHistory) {
      prompt += `${msg.role}: ${msg.content}\n`;
    }

    // Add new message
    prompt += `user: ${newMessage}\n`;

    return prompt;
  }

  cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [chatId, sessions] of this.sessions.entries()) {
      const validSessions = sessions.filter(s => {
        if (s.status === 'active' && s.expiresAt < now) {
          s.status = 'expired';
          cleaned++;
          return false;
        }
        return true;
      });

      if (validSessions.length === 0) {
        this.sessions.delete(chatId);
      } else {
        this.sessions.set(chatId, validSessions);
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired sessions`);
    }
  }
}
```

**Acceptance Criteria**:
- All session tests pass (100% coverage)
- Sessions expire after 1 hour
- Context includes last 5 sessions
- Automatic cleanup works
- No memory leaks

---

## Phase 3: Hooks Implementation

**Duration**: 5-6 days

### 3.1 Create Hooks Library

**Generate Library**:
```bash
nx g @nx/nest:library hooks --directory=libs/agent/hooks --no-interactive
```

**File Structure**:
```
libs/agent/hooks/
├── src/
│   ├── lib/
│   │   ├── hooks.service.ts
│   │   ├── hooks.service.spec.ts
│   │   ├── hook-factories/
│   │   │   ├── budget-hook.ts
│   │   │   ├── security-hook.ts
│   │   │   ├── analytics-hook.ts
│   │   │   └── caching-hook.ts
│   │   └── interfaces/
│   │       └── hook-types.ts
│   └── index.ts
```

### 3.2 Define Hook Interfaces

**Location**: `libs/agent/hooks/src/lib/interfaces/hook-types.ts`

```typescript
import { SDKMessage, ToolUseMessage, ToolResultMessage } from '@anthropic-ai/claude-agent-sdk';

export type OnMessageHook = (message: SDKMessage) => void;
export type OnToolUseHook = (toolUse: ToolUseMessage) => ToolUseMessage | void;
export type OnToolResultHook = (result: ToolResultMessage) => ToolResultMessage | void;

export interface HookContext {
  sessionId: string;
  chatId: string;
  ticker: string;
  phase: 'full-analysis' | 'executive-summary' | 'conversation';
}

export interface BudgetConfig {
  limit: number;
  used: number;
  toolCosts: Record<string, number>;
}
```

### 3.3 TDD: HooksService

**Test File**: `libs/agent/hooks/src/lib/hooks.service.spec.ts`

```typescript
describe('HooksService', () => {
  let service: HooksService;
  let eventEmitter: EventEmitter2;
  let sessionManager: SessionManagerService;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    sessionManager = new SessionManagerService();
    service = new HooksService(eventEmitter, sessionManager);
  });

  describe('createOnMessageHook', () => {
    it('should log message types', () => {
      const logSpy = jest.spyOn(service['logger'], 'debug');
      const hook = service.createOnMessageHook('session1', 'chat1');

      hook({ type: 'assistant', message: { content: [] } } as any);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Message: assistant'));
    });

    it('should track token usage', () => {
      sessionManager.createSession('chat1', 'AAPL');
      const hook = service.createOnMessageHook('session1', 'chat1');

      hook({
        type: 'assistant',
        message: {
          content: [],
          usage: { input_tokens: 1000, output_tokens: 500 }
        }
      } as any);

      const session = sessionManager.getActiveSession('chat1');
      expect(session!.metrics.tokens).toBe(1500);
    });

    it('should emit progress events', () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');
      const hook = service.createOnMessageHook('session1', 'chat1');

      hook({ type: 'assistant', message: { content: [] } } as any);

      expect(emitSpy).toHaveBeenCalledWith(
        'stream.progress.session1',
        expect.objectContaining({ messageType: 'assistant' })
      );
    });
  });

  describe('createOnToolUseHook', () => {
    it('should validate tool inputs', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'fetch_company_data', input: {} } as any);
      }).toThrow('Missing required parameter: ticker');
    });

    it('should block PDF generation in conversation mode', () => {
      sessionManager.createSession('chat1', 'AAPL');
      sessionManager.addMessage('chat1', 'user', 'Question');

      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'generate_pdf', input: {} } as any);
      }).toThrow('PDF generation only available during initial analysis');
    });

    it('should inject session context into tool input', () => {
      sessionManager.createSession('chat1', 'AAPL');
      const hook = service.createOnToolUseHook('session1', 'chat1');

      const result = hook({
        name: 'fetch_company_data',
        input: { ticker: 'AAPL' }
      } as any);

      expect(result.input).toMatchObject({
        ticker: 'AAPL',
        sessionId: 'session1',
        tickerContext: 'AAPL'
      });
    });

    it('should enforce budget limits', () => {
      service.setBudget('session1', { limit: 1.0, used: 0.9, toolCosts: {} });
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({
          name: 'fetch_company_data',
          input: { ticker: 'AAPL' },
          cost: 0.2
        } as any);
      }).toThrow('Budget exceeded');
    });

    it('should track budget usage', () => {
      service.setBudget('session1', {
        limit: 5.0,
        used: 0,
        toolCosts: { fetch_company_data: 0.1 }
      });
      const hook = service.createOnToolUseHook('session1', 'chat1');

      hook({
        name: 'fetch_company_data',
        input: { ticker: 'AAPL' }
      } as any);

      const budget = service.getBudget('session1');
      expect(budget.used).toBe(0.1);
    });
  });

  describe('createOnToolResultHook', () => {
    it('should enhance error messages with context', () => {
      sessionManager.createSession('chat1', 'AAPL');
      const hook = service.createOnToolResultHook('session1', 'chat1');

      const result = hook({
        tool_use_id: 'tool1',
        content: 'API rate limit exceeded',
        is_error: true
      } as any);

      expect(result.content).toContain('Error occurred while analyzing AAPL');
      expect(result.content).toContain('API rate limit exceeded');
    });

    it('should filter sensitive data from results', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      const result = hook({
        tool_use_id: 'tool1',
        content: JSON.stringify({ apiKey: 'secret', data: 'public' }),
        is_error: false
      } as any);

      const parsed = JSON.parse(result.content);
      expect(parsed.apiKey).toBeUndefined();
      expect(parsed.data).toBe('public');
    });

    it('should cache tool results', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      hook({
        tool_use_id: 'tool1',
        content: 'result data',
        is_error: false
      } as any);

      const cached = service.getCachedResult('tool1');
      expect(cached).toBe('result data');
    });
  });

  describe('hook composition', () => {
    it('should chain multiple onToolUse hooks', () => {
      const hook1 = (tool: any) => ({ ...tool, input: { ...tool.input, hook1: true } });
      const hook2 = (tool: any) => ({ ...tool, input: { ...tool.input, hook2: true } });

      const composed = service.composeToolUseHooks([hook1, hook2]);
      const result = composed({ name: 'test', input: {} } as any);

      expect(result.input).toMatchObject({ hook1: true, hook2: true });
    });
  });
});
```

### 3.4 Implement HooksService

**Location**: `libs/agent/hooks/src/lib/hooks.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionManagerService } from '@stock-analyzer/agent/session';
import {
  OnMessageHook,
  OnToolUseHook,
  OnToolResultHook,
  BudgetConfig
} from './interfaces/hook-types';

@Injectable()
export class HooksService {
  private readonly logger = new Logger(HooksService.name);
  private budgets = new Map<string, BudgetConfig>();
  private toolResultCache = new Map<string, string>();

  constructor(
    private eventEmitter: EventEmitter2,
    private sessionManager: SessionManagerService
  ) {}

  // ========================================================================
  // Hook Factories
  // ========================================================================

  createOnMessageHook(sessionId: string, chatId: string): OnMessageHook {
    return (message) => {
      // Log all message types
      this.logger.debug(`[${sessionId}] Message: ${message.type}`);

      // Track token usage
      if (message.type === 'assistant' && message.message.usage) {
        const usage = message.message.usage;
        this.sessionManager.addMetric(
          chatId,
          'tokens',
          usage.input_tokens + usage.output_tokens
        );
      }

      // Emit progress event
      this.eventEmitter.emit(`stream.progress.${sessionId}`, {
        sessionId,
        messageType: message.type,
        timestamp: new Date().toISOString(),
      });
    };
  }

  createOnToolUseHook(sessionId: string, chatId: string): OnToolUseHook {
    return (toolUse) => {
      const session = this.sessionManager.getActiveSession(chatId);

      // Validation
      this.validateToolInput(toolUse.name, toolUse.input);

      // Security: Block PDF in conversation mode
      if (toolUse.name === 'generate_pdf') {
        if (session && session.conversationHistory.length > 0) {
          throw new Error(
            'PDF generation only available during initial analysis. ' +
            'Use /analyze to start a new analysis.'
          );
        }
      }

      // Budget control
      const budget = this.budgets.get(sessionId);
      if (budget) {
        const cost = budget.toolCosts[toolUse.name] || 0.01;
        if (budget.used + cost > budget.limit) {
          throw new Error(
            `Budget exceeded: $${budget.used.toFixed(2)}/$${budget.limit.toFixed(2)}`
          );
        }
        budget.used += cost;
      }

      // Inject session context
      return {
        ...toolUse,
        input: {
          ...toolUse.input,
          sessionId,
          tickerContext: session?.ticker,
        },
      };
    };
  }

  createOnToolResultHook(sessionId: string, chatId: string): OnToolResultHook {
    return (result) => {
      const session = this.sessionManager.getActiveSession(chatId);

      // Enhance errors with context
      if (result.is_error) {
        return {
          ...result,
          content: this.enhanceErrorWithContext(result.content, session),
        };
      }

      // Filter sensitive data
      let content = this.filterSensitiveData(result.content);

      // Cache result
      this.toolResultCache.set(result.tool_use_id, content);

      return {
        ...result,
        content,
      };
    };
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  private validateToolInput(toolName: string, input: any): void {
    if (toolName === 'fetch_company_data' && !input.ticker) {
      throw new Error('Missing required parameter: ticker');
    }
    // Add more validations as needed
  }

  private enhanceErrorWithContext(error: string, session: any): string {
    if (!session) return error;

    return (
      `Error occurred while analyzing ${session.ticker}:\n\n` +
      error +
      `\n\nSession info:\n` +
      `• Started: ${session.startedAt.toLocaleString()}\n` +
      `• Conversation turns: ${session.conversationHistory.length}`
    );
  }

  private filterSensitiveData(content: string): string {
    try {
      const data = JSON.parse(content);
      const { apiKey, apiSecret, password, ...safe } = data;
      return JSON.stringify(safe);
    } catch {
      return content;
    }
  }

  setBudget(sessionId: string, budget: BudgetConfig): void {
    this.budgets.set(sessionId, budget);
  }

  getBudget(sessionId: string): BudgetConfig | undefined {
    return this.budgets.get(sessionId);
  }

  getCachedResult(toolUseId: string): string | undefined {
    return this.toolResultCache.get(toolUseId);
  }

  composeToolUseHooks(hooks: OnToolUseHook[]): OnToolUseHook {
    return (toolUse) => {
      return hooks.reduce((current, hook) => {
        const result = hook(current);
        return result || current;
      }, toolUse);
    };
  }
}
```

**Acceptance Criteria**:
- All hook tests pass (100% coverage)
- Hooks can block tool execution
- Budget tracking works correctly
- Error enhancement adds context
- Hooks are composable

---

## Phase 4: Enhanced Agent with Streaming & Hooks

**Duration**: 6-7 days

### 4.1 Complete SDK Message Type Support

**CRITICAL**: The Agent SDK emits 7 message types that we MUST handle:

```typescript
type SDKMessage =
  | SDKAssistantMessage      // Complete assistant response
  | SDKUserMessage           // User input message
  | SDKUserMessageReplay     // Replayed user message (required UUID)
  | SDKResultMessage         // Final conversation result (with cost, tokens, errors)
  | SDKSystemMessage         // Initialization message (session setup)
  | SDKPartialAssistantMessage  // Streaming partial updates (when includePartialMessages=true)
  | SDKCompactBoundaryMessage   // Conversation compaction signal
```

**Message Type Handling Strategy**:

1. **SDKAssistantMessage** - Extract text, thinking, tool_use blocks → emit events
2. **SDKUserMessage** - Extract tool_result blocks → emit tool result events
3. **SDKUserMessageReplay** - Log for debugging, no special handling needed
4. **SDKResultMessage** - Emit final completion with cost/duration/errors
5. **SDKSystemMessage** - Log system initialization, track session metadata
6. **SDKPartialAssistantMessage** - Enable for real-time token streaming (optional)
7. **SDKCompactBoundaryMessage** - Log compaction events, track conversation size

**Updated Test Coverage for All Types**:

```typescript
describe('AgentService - All SDK Message Types', () => {
  describe('SDKAssistantMessage', () => {
    it('should process text blocks')
    it('should process thinking blocks')
    it('should process tool_use blocks')
    it('should emit appropriate events for each block type')
    it('should track usage stats')
  })

  describe('SDKUserMessage', () => {
    it('should process tool_result blocks')
    it('should emit tool completion events')
    it('should handle PDF tool results specially')
  })

  describe('SDKUserMessageReplay', () => {
    it('should log replayed messages for debugging')
    it('should not duplicate event emission')
  })

  describe('SDKResultMessage', () => {
    it('should emit final result with execution details')
    it('should track cost and token usage')
    it('should handle permission denials')
    it('should report different error types')
  })

  describe('SDKSystemMessage', () => {
    it('should log system initialization')
    it('should track API key source')
    it('should record tool availability')
    it('should log permission mode')
  })

  describe('SDKPartialAssistantMessage', () => {
    it('should emit partial text updates when enabled')
    it('should accumulate partial content')
    it('should only activate when includePartialMessages=true')
  })

  describe('SDKCompactBoundaryMessage', () => {
    it('should log compaction events')
    it('should track conversation size before/after')
    it('should emit compaction metadata')
  })
})
```

### 4.2 Refactor AgentService

**Goal**: Integrate sessions + hooks + complete message type handling

**Test File**: `libs/agent/core/src/lib/agent.service.spec.ts` (expanded)

**New Test Cases**:

```typescript
describe('AgentService - Enhanced', () => {
  describe('analyzeStock (Workflow Mode)', () => {
    it('should create new session', async () => {
      const result = await service.analyzeStock('chat1', 'AAPL', 'Analyze AAPL');

      const session = sessionManager.getActiveSession('chat1');
      expect(session).not.toBeNull();
      expect(session!.ticker).toBe('AAPL');
    });

    it('should execute query with hooks', async () => {
      const onMessageSpy = jest.spyOn(hooksService, 'createOnMessageHook');
      const onToolUseSpy = jest.spyOn(hooksService, 'createOnToolUseHook');

      await service.analyzeStock('chat1', 'AAPL', 'Analyze AAPL');

      expect(onMessageSpy).toHaveBeenCalled();
      expect(onToolUseSpy).toHaveBeenCalled();
    });

    it('should emit all SDK message types', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await service.analyzeStock('chat1', 'AAPL', 'Analyze AAPL');

      // Should emit: chunk, thinking, tool, tool_result, complete
      expect(emitSpy).toHaveBeenCalledWith(
        expect.stringContaining('chunk'),
        expect.any(Object)
      );
      expect(emitSpy).toHaveBeenCalledWith(
        expect.stringContaining('thinking'),
        expect.any(Object)
      );
    });

    it('should save results to session on completion', async () => {
      await service.analyzeStock('chat1', 'AAPL', 'Analyze AAPL');

      const sessions = sessionManager['sessions'].get('chat1');
      const session = sessions![0];
      expect(session.status).toBe('completed');
      expect(session.executiveSummary).toBeTruthy();
    });
  });

  describe('handleConversation (Conversation Mode)', () => {
    it('should use session context in prompt', async () => {
      sessionManager.createSession('chat1', 'AAPL');
      sessionManager.addMessage('chat1', 'user', 'First question');

      const buildContextSpy = jest.spyOn(sessionManager, 'buildContextPrompt');

      await service.handleConversation('chat1', 'Second question');

      expect(buildContextSpy).toHaveBeenCalledWith('chat1', 'Second question');
    });

    it('should add Q&A to session history', async () => {
      sessionManager.createSession('chat1', 'AAPL');

      await service.handleConversation('chat1', 'What is the P/E?');

      const session = sessionManager.getActiveSession('chat1')!;
      expect(session.conversationHistory).toHaveLength(2); // Q + A
      expect(session.conversationHistory[0].content).toBe('What is the P/E?');
    });

    it('should throw when no active session', async () => {
      await expect(
        service.handleConversation('chat999', 'Question')
      ).rejects.toThrow('No active session');
    });
  });

  describe('executeQuery - Message Type Handling', () => {
    it('should process thinking messages', async () => {
      const mockStream = MockSDKStream.createStream([
        MockSDKStream.createThinkingMessage('Analyzing data...')
      ]);

      jest.spyOn(sdk, 'query').mockReturnValue(mockStream);

      const emitSpy = jest.spyOn(eventEmitter, 'emit');
      await service.analyzeStock('chat1', 'AAPL', 'Analyze');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.stringContaining('thinking'),
        expect.objectContaining({ message: 'Analyzing data...' })
      );
    });

    it('should process error messages', async () => {
      const mockStream = MockSDKStream.createStream([
        MockSDKStream.createErrorMessage('Rate limit exceeded')
      ]);

      jest.spyOn(sdk, 'query').mockReturnValue(mockStream);

      await expect(
        service.analyzeStock('chat1', 'AAPL', 'Analyze')
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should emit turn_complete with token stats', async () => {
      const mockStream = MockSDKStream.createStream([
        MockSDKStream.createAssistantMessage('Analysis...', {
          stop_reason: 'end_turn',
          usage: { input_tokens: 1000, output_tokens: 500 }
        })
      ]);

      jest.spyOn(sdk, 'query').mockReturnValue(mockStream);

      const emitSpy = jest.spyOn(eventEmitter, 'emit');
      await service.analyzeStock('chat1', 'AAPL', 'Analyze');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.stringContaining('turn_complete'),
        expect.objectContaining({
          stopReason: 'end_turn',
          inputTokens: 1000,
          outputTokens: 500
        })
      );
    });
  });
});
```

### 4.2 Implement Enhanced AgentService

**Location**: `libs/agent/core/src/lib/agent.service.ts` (major refactor)

**Key Changes**:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionManagerService } from '@stock-analyzer/agent/session';
import { HooksService } from '@stock-analyzer/agent/hooks';
import { STOCK_VALUATION_FRAMEWORK } from './prompts/framework-v2.3';
import { createToolRegistry } from '@stock-analyzer/mcp/tools';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly toolRegistry;
  private readonly mcpServer;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private sessionManager: SessionManagerService,
    private hooksService: HooksService
  ) {
    // ... existing SDK setup
  }

  /**
   * WORKFLOW MODE: Full Analysis
   * Creates session, runs 2-phase analysis with streaming
   */
  async analyzeStock(
    chatId: string,
    ticker: string,
    userPrompt: string
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Step 1: Create session
    const session = this.sessionManager.createSession(chatId, ticker);
    const sessionId = session.sessionId;

    this.logger.log(`[${sessionId}] Starting analysis for ${ticker}`);

    try {
      // Step 2: Execute analysis with streaming
      const executiveSummary = await this.executeQuery({
        chatId,
        sessionId,
        ticker,
        prompt: userPrompt,
        phase: 'executive-summary',
        streamToClient: true,
      });

      // Step 3: Complete session
      this.sessionManager.completeSession(
        chatId,
        executiveSummary,
        executiveSummary
      );

      // Step 4: Emit completion
      const duration = Date.now() - startTime;
      const result: AnalysisResult = {
        ticker,
        timestamp: new Date().toISOString(),
        executiveSummary,
        metadata: {
          analysisDate: new Date().toISOString(),
          framework: FRAMEWORK_VERSION,
          model: this.config.get('ANTHROPIC_MODEL') || DEFAULT_MODEL,
          duration,
        },
      };

      this.eventEmitter.emit(`analysis.complete.${sessionId}`, {
        ticker,
        metadata: result.metadata,
      });

      return result;

    } catch (error) {
      this.logger.error(`[${sessionId}] Analysis failed:`, error);
      this.sessionManager.stopSession(chatId);
      throw error;
    }
  }

  /**
   * CONVERSATION MODE: Follow-up Questions
   * Uses session context, streams response
   */
  async handleConversation(
    chatId: string,
    message: string
  ): Promise<string> {
    const session = this.sessionManager.getActiveSession(chatId);

    if (!session) {
      throw new Error('No active session for conversation');
    }

    this.logger.log(`[${session.sessionId}] Conversation: ${message.substring(0, 50)}...`);

    // Step 1: Build context from session
    const contextPrompt = this.sessionManager.buildContextPrompt(chatId, message);

    // Step 2: Execute with streaming
    const result = await this.executeQuery({
      chatId,
      sessionId: session.sessionId,
      ticker: session.ticker,
      prompt: contextPrompt,
      phase: 'conversation',
      streamToClient: true,
    });

    // Step 3: Save to session
    this.sessionManager.addMessage(chatId, 'user', message);
    this.sessionManager.addMessage(chatId, 'assistant', result);

    return result;
  }

  /**
   * Core Query Executor with Integrated Systems
   */
  private async executeQuery(params: {
    chatId: string;
    sessionId: string;
    ticker: string;
    prompt: string;
    phase: 'full-analysis' | 'executive-summary' | 'conversation';
    streamToClient: boolean;
  }): Promise<string> {
    const { chatId, sessionId, ticker, prompt, phase, streamToClient } = params;

    let fullContent = '';
    let totalTokens = 0;

    // Create SDK query with session-aware hooks
    const stream = query({
      prompt,
      options: {
        systemPrompt: STOCK_VALUATION_FRAMEWORK,
        model: this.config.get('ANTHROPIC_MODEL') || DEFAULT_MODEL,
        maxThinkingTokens: DEFAULT_MAX_THINKING_TOKENS,
        maxTurns: DEFAULT_MAX_TURNS,
        permissionMode: 'bypassPermissions',
        mcpServers: {
          'stock-analyzer': this.mcpServer,
        },

        // Session-aware hooks
        onMessage: this.hooksService.createOnMessageHook(sessionId, chatId),
        onToolUse: this.hooksService.createOnToolUseHook(sessionId, chatId),
        onToolResult: this.hooksService.createOnToolResultHook(sessionId, chatId),
      },
    });

    // Process stream with COMPLETE message type handling (all 7 types)
    for await (const message of stream) {

      // 1. SDKAssistantMessage - Complete assistant response
      if (message.type === 'assistant') {
        const apiMessage = message.message;

        for (const block of apiMessage.content) {

          // Text block - stream if enabled
          if (block.type === 'text') {
            fullContent += block.text;

            if (streamToClient) {
              this.eventEmitter.emit(`analysis.chunk.${sessionId}`, {
                ticker,
                content: block.text,
                phase,
                timestamp: new Date().toISOString(),
              });
            }
          }

          // Thinking block - show reasoning
          else if (block.type === 'thinking') {
            this.eventEmitter.emit(`analysis.thinking.${sessionId}`, {
              ticker,
              message: 'Analyzing data...',
              content: block.thinking,
              timestamp: new Date().toISOString(),
            });
          }

          // Tool use block
          else if (block.type === 'tool_use') {
            this.eventEmitter.emit(`analysis.tool.${sessionId}`, {
              ticker,
              toolName: block.name,
              toolId: block.id,
              toolInput: block.input,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Track tokens
        if (apiMessage.usage) {
          totalTokens += apiMessage.usage.input_tokens + apiMessage.usage.output_tokens;
        }

        // Emit turn complete
        if (apiMessage.stop_reason) {
          this.eventEmitter.emit(`analysis.turn_complete.${sessionId}`, {
            ticker,
            phase,
            stopReason: apiMessage.stop_reason,
            inputTokens: apiMessage.usage?.input_tokens || 0,
            outputTokens: apiMessage.usage?.output_tokens || 0,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 2. SDKUserMessage - User input/tool results
      else if (message.type === 'user') {
        const apiMessage = message.message;

        for (const block of apiMessage.content) {
          if (block.type === 'tool_result') {
            this.eventEmitter.emit(`analysis.tool_result.${sessionId}`, {
              ticker,
              toolId: block.tool_use_id,
              timestamp: new Date().toISOString(),
            });

            // Special handling for PDF
            if (block.tool_use_id.includes('generate_pdf')) {
              try {
                const pdfData = JSON.parse(block.content[0].text);
                if (pdfData.success && pdfData.pdfBase64) {
                  this.eventEmitter.emit(`analysis.pdf.${sessionId}`, {
                    ticker: pdfData.ticker,
                    pdfBase64: pdfData.pdfBase64,
                    fileSize: pdfData.fileSize,
                    reportType: pdfData.reportType,
                    timestamp: new Date().toISOString(),
                  });
                }
              } catch (e) {
                this.logger.error('Failed to parse PDF result', e);
              }
            }
          }
        }
      }

      // 3. SDKUserMessageReplay - Replayed user message
      else if (message.type === 'user_message_replay') {
        this.logger.debug(`[${sessionId}] User message replayed: ${message.uuid}`);
        // No event emission needed - this is internal SDK behavior
      }

      // 4. SDKResultMessage - Final conversation result
      else if (message.type === 'result') {
        this.logger.log(`[${sessionId}] Analysis result received`);

        // Emit result metadata
        this.eventEmitter.emit(`analysis.result.${sessionId}`, {
          ticker,
          success: !message.error,
          executionTime: message.executionTimeMs,
          cost: message.costUsd,
          totalTokens: message.totalTokens,
          errorType: message.error?.type,
          errorMessage: message.error?.message,
          permissionDenials: message.permissionDenials || [],
          timestamp: new Date().toISOString(),
        });
      }

      // 5. SDKSystemMessage - System initialization
      else if (message.type === 'system') {
        this.logger.log(`[${sessionId}] System initialized`);

        // Track system configuration
        this.eventEmitter.emit(`analysis.system.${sessionId}`, {
          ticker,
          apiKeySource: message.apiKeySource,
          model: message.model,
          permissionMode: message.permissionMode,
          toolsAvailable: message.tools?.length || 0,
          timestamp: new Date().toISOString(),
        });
      }

      // 6. SDKPartialAssistantMessage - Streaming partial updates
      else if (message.type === 'partial_assistant') {
        // Only emitted when includePartialMessages=true
        // Useful for token-by-token streaming
        if (streamToClient) {
          this.eventEmitter.emit(`analysis.partial.${sessionId}`, {
            ticker,
            partialContent: message.partialText,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 7. SDKCompactBoundaryMessage - Conversation compaction
      else if (message.type === 'compact_boundary') {
        this.logger.log(`[${sessionId}] Conversation compacted`);

        // Track compaction for conversation size monitoring
        this.eventEmitter.emit(`analysis.compaction.${sessionId}`, {
          ticker,
          trigger: message.trigger,
          messagesBefore: message.originalMessageCount,
          messagesAfter: message.compactedMessageCount,
          timestamp: new Date().toISOString(),
        });
      }

      // Catch-all for unknown message types (future-proofing)
      else {
        this.logger.warn(`[${sessionId}] Unknown message type: ${(message as any).type}`);
      }
    }

    return fullContent;
  }
}
```

**Acceptance Criteria**:
- All agent tests pass
- Sessions integrate cleanly
- Hooks execute correctly
- All message types handled
- Events emit with session context

---

## Phase 5: Telegram Bot Refactor

**Duration**: 5-6 days

### 5.1 Add Conversation Routing

**Test File**: `libs/bot/telegram/src/lib/telegram-bot.service.spec.ts` (expanded)

**New Test Cases**:

```typescript
describe('TelegramBotService - Enhanced', () => {
  describe('Message Routing', () => {
    it('should route /analyze to workflow mode', async () => {
      const analyzeStockSpy = jest.spyOn(agentService, 'analyzeStock');

      await service.handleAnalyzeCommand(mockContext('/analyze AAPL'));

      expect(analyzeStockSpy).toHaveBeenCalled();
    });

    it('should route text to conversation mode when session active', async () => {
      sessionManager.createSession('chat1', 'AAPL');
      const handleConvSpy = jest.spyOn(agentService, 'handleConversation');

      await service.handleTextMessage(mockContext('What is the P/E?'));

      expect(handleConvSpy).toHaveBeenCalledWith('chat1', 'What is the P/E?');
    });

    it('should show help when no active session', async () => {
      const ctx = mockContext('Some question');
      await service.handleTextMessage(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No active session')
      );
    });

    it('should recognize ticker patterns', async () => {
      const analyzeStockSpy = jest.spyOn(agentService, 'analyzeStock');

      await service.handleTextMessage(mockContext('AAPL'));

      expect(analyzeStockSpy).toHaveBeenCalled();
    });
  });

  describe('Session Conflict Handling', () => {
    it('should show confirmation when switching sessions', async () => {
      sessionManager.createSession('chat1', 'AAPL');
      const ctx = mockContext('/analyze MSFT');

      await service.handleAnalyzeCommand(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('active analysis for AAPL'),
        expect.objectContaining({
          reply_markup: expect.any(Object) // Inline keyboard
        })
      );
    });

    it('should handle confirmation callback', async () => {
      sessionManager.createSession('chat1', 'AAPL');
      const ctx = mockCallbackQuery('analyze:MSFT');

      await service.handleCallbackQuery(ctx);

      const session = sessionManager.getActiveSession('chat1');
      expect(session?.ticker).toBe('MSFT');
    });
  });

  describe('Commands', () => {
    it('should handle /stop command', async () => {
      sessionManager.createSession('chat1', 'AAPL');
      const ctx = mockContext('/stop');

      await service.handleStopCommand(ctx);

      const session = sessionManager.getActiveSession('chat1');
      expect(session).toBeNull();
    });

    it('should handle /status command', async () => {
      sessionManager.createSession('chat1', 'AAPL');
      const ctx = mockContext('/status');

      await service.handleStatusCommand(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Active session: AAPL')
      );
    });
  });
});
```

### 5.2 Implement Enhanced TelegramBotService

**Location**: `libs/bot/telegram/src/lib/telegram-bot.service.ts` (major refactor)

**Key Changes**:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context, Markup } from 'telegraf';
import { StreamManagerService } from './stream-manager.service';
import { SessionManagerService } from '@stock-analyzer/agent/session';
import { AgentService } from '@stock-analyzer/agent/core';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    private configService: ConfigService,
    private streamManager: StreamManagerService,
    private sessionManager: SessionManagerService,
    private agentService: AgentService
  ) {
    const token = this.configService.get<string>('telegram.botToken');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    await this.setupBot();
    await this.bot.launch();
    this.logger.log('Bot started');
  }

  private async setupBot() {
    // Commands
    this.bot.command('start', this.handleStartCommand.bind(this));
    this.bot.command('analyze', this.handleAnalyzeCommand.bind(this));
    this.bot.command('stop', this.handleStopCommand.bind(this));
    this.bot.command('status', this.handleStatusCommand.bind(this));
    this.bot.command('help', this.handleHelpCommand.bind(this));

    // Callback queries (for inline keyboards)
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));

    // Text messages
    this.bot.on('text', this.handleTextMessage.bind(this));

    // Error handling
    this.bot.catch((err: unknown, ctx) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Bot error: ${errorMessage}`);
      ctx.reply('An error occurred. Please try again.').catch(() => {});
    });
  }

  /**
   * /analyze Command - Start New Analysis (Workflow Mode)
   */
  private async handleAnalyzeCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const ticker = text.split(' ')[1]?.toUpperCase();
    const chatId = ctx.chat?.id.toString();

    if (!ticker) {
      await ctx.reply('Please provide a ticker symbol. Example: /analyze AAPL');
      return;
    }

    if (!chatId) return;

    // Check for session conflict
    const activeSession = this.sessionManager.getActiveSession(chatId);

    if (activeSession && activeSession.ticker !== ticker) {
      // Show confirmation dialog
      await ctx.reply(
        `⚠️ You have an active analysis for ${activeSession.ticker}.\n\n` +
        `📊 Current session:\n` +
        `• Started: ${this.formatTime(activeSession.startedAt)}\n` +
        `• Messages: ${activeSession.conversationHistory.length}\n` +
        `• Expires: ${this.formatTime(activeSession.expiresAt)}\n\n` +
        `Start new analysis for ${ticker}?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✋ Keep Current', 'cancel'),
            Markup.button.callback('🔄 Switch', `analyze:${ticker}`),
          ],
        ])
      );
      return;
    }

    // Start analysis
    await this.startAnalysis(ctx, ticker);
  }

  /**
   * Text Message Handler - Smart Routing
   */
  private async handleTextMessage(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const chatId = ctx.chat?.id.toString();

    // Skip commands
    if (text.startsWith('/')) return;

    // Check if it's a ticker pattern (1-5 uppercase letters)
    if (/^[A-Z]{1,5}$/.test(text)) {
      (ctx.message as any).text = `/analyze ${text}`;
      await this.handleAnalyzeCommand(ctx);
      return;
    }

    // Conversation mode
    const activeSession = this.sessionManager.getActiveSession(chatId!);

    if (!activeSession) {
      await ctx.reply(
        '💡 No active session.\n\n' +
        'Start an analysis:\n' +
        '• /analyze AAPL\n' +
        '• Or just send: AAPL'
      );
      return;
    }

    // Handle conversation
    await this.handleConversation(ctx, text, activeSession);
  }

  /**
   * Callback Query Handler - For Inline Keyboards
   */
  private async handleCallbackQuery(ctx: Context) {
    const query = (ctx.callbackQuery as any)?.data;
    const chatId = ctx.chat?.id.toString();

    if (!query || !chatId) return;

    if (query === 'cancel') {
      await ctx.answerCbQuery('Keeping current session');
      await ctx.editMessageReplyMarkup(undefined);
      return;
    }

    if (query.startsWith('analyze:')) {
      const ticker = query.split(':')[1];
      await ctx.answerCbQuery(`Starting ${ticker} analysis...`);
      await ctx.editMessageReplyMarkup(undefined);

      // Stop current session
      this.sessionManager.stopSession(chatId);

      // Start new analysis
      await this.startAnalysis(ctx, ticker);
    }
  }

  /**
   * /stop Command
   */
  private async handleStopCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    if (this.sessionManager.stopSession(chatId)) {
      await ctx.reply('✅ Analysis session stopped.');
    } else {
      await ctx.reply('No active session to stop.');
    }
  }

  /**
   * /status Command
   */
  private async handleStatusCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const activeSession = this.sessionManager.getActiveSession(chatId);
    const recentSessions = this.sessionManager.getRecentSessions(chatId);

    let message = '📊 **Session Status**\n\n';

    if (activeSession) {
      const timeLeft = Math.floor(
        (activeSession.expiresAt.getTime() - Date.now()) / 60000
      );

      message += `🟢 **Active Session**\n`;
      message += `• Ticker: ${activeSession.ticker}\n`;
      message += `• Started: ${this.formatTime(activeSession.startedAt)}\n`;
      message += `• Messages: ${activeSession.conversationHistory.length}\n`;
      message += `• Expires in: ${timeLeft} minutes\n`;
      message += `• Tool calls: ${activeSession.metrics.toolCalls}\n`;
      message += `• Tokens used: ${activeSession.metrics.tokens}\n\n`;
    } else {
      message += `ℹ️ No active session\n\n`;
    }

    if (recentSessions.length > 0) {
      message += `📚 **Recent Sessions**\n`;
      for (const session of recentSessions) {
        message += `⚪ ${session.ticker} - ${this.formatTime(session.startedAt)}\n`;
      }
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  // ... other helper methods
}
```

**Acceptance Criteria**:
- All bot tests pass
- Session routing works correctly
- Confirmation dialogs work
- /stop and /status commands work
- Conversation mode works

---

## Phase 6: Integration & E2E Testing

**Duration**: 4-5 days

### 6.1 End-to-End Test Scenarios

**Test File**: `libs/e2e/agent-e2e/src/agent/full-flow.spec.ts`

```typescript
describe('Full Flow E2E Tests', () => {

  describe('Workflow Mode: New Analysis', () => {
    it('should complete full analysis from Telegram to Agent', async () => {
      // 1. User sends /analyze AAPL
      const ctx = mockTelegramContext('chat1', '/analyze AAPL');
      await bot.handleAnalyzeCommand(ctx);

      // 2. Session created
      const session = sessionManager.getActiveSession('chat1');
      expect(session).not.toBeNull();
      expect(session!.ticker).toBe('AAPL');

      // 3. Stream events emitted
      const events = captureEmittedEvents();
      expect(events).toContainEqual(expect.objectContaining({ type: 'chunk' }));
      expect(events).toContainEqual(expect.objectContaining({ type: 'tool' }));
      expect(events).toContainEqual(expect.objectContaining({ type: 'complete' }));

      // 4. Bot UI updated
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();

      // 5. Session marked complete
      expect(session!.status).toBe('completed');
      expect(session!.executiveSummary).toBeTruthy();
    });
  });

  describe('Conversation Mode: Follow-up Questions', () => {
    it('should handle follow-up questions with context', async () => {
      // 1. Create completed session
      const session = sessionManager.createSession('chat1', 'AAPL');
      session.executiveSummary = 'Apple shows strong fundamentals...';
      sessionManager.completeSession('chat1', '', session.executiveSummary);

      // 2. User asks follow-up
      const ctx = mockTelegramContext('chat1', 'What is the P/E ratio?');
      await bot.handleTextMessage(ctx);

      // 3. Context includes previous analysis
      const buildContextSpy = jest.spyOn(sessionManager, 'buildContextPrompt');
      expect(buildContextSpy).toHaveBeenCalled();
      const context = buildContextSpy.mock.results[0].value;
      expect(context).toContain('AAPL Analysis');
      expect(context).toContain('What is the P/E ratio?');

      // 4. Response streamed
      expect(ctx.reply).toHaveBeenCalled();

      // 5. History updated
      expect(session.conversationHistory).toHaveLength(2); // Q + A
    });
  });

  describe('Session Conflict Resolution', () => {
    it('should handle session conflicts gracefully', async () => {
      // 1. Create active AAPL session
      sessionManager.createSession('chat1', 'AAPL');

      // 2. User tries to analyze MSFT
      const ctx = mockTelegramContext('chat1', '/analyze MSFT');
      await bot.handleAnalyzeCommand(ctx);

      // 3. Confirmation shown
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('active analysis for AAPL'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );

      // 4. User confirms switch
      const callbackCtx = mockCallbackQuery('chat1', 'analyze:MSFT');
      await bot.handleCallbackQuery(callbackCtx);

      // 5. Old session stopped
      const sessions = sessionManager['sessions'].get('chat1');
      const aaplSession = sessions!.find(s => s.ticker === 'AAPL');
      expect(aaplSession!.status).toBe('stopped');

      // 6. New session started
      const msftSession = sessionManager.getActiveSession('chat1');
      expect(msftSession!.ticker).toBe('MSFT');
    });
  });

  describe('Cross-Session Comparison', () => {
    it('should enable comparisons across sessions', async () => {
      // 1. Analyze AAPL
      await bot.handleAnalyzeCommand(mockTelegramContext('chat1', '/analyze AAPL'));
      await waitForCompletion();

      // 2. Analyze MSFT
      const ctx2 = mockTelegramContext('chat1', '/analyze MSFT');
      await bot.handleCallbackQuery(mockCallbackQuery('chat1', 'analyze:MSFT'));
      await waitForCompletion();

      // 3. Ask comparison question
      const ctx3 = mockTelegramContext('chat1', 'Compare to Apple');
      await bot.handleTextMessage(ctx3);

      // 4. Context includes both sessions
      const buildContextSpy = jest.spyOn(sessionManager, 'buildContextPrompt');
      const context = buildContextSpy.mock.results[0].value;
      expect(context).toContain('AAPL Analysis');
      expect(context).toContain('MSFT Analysis');
    });
  });

  describe('Error Handling', () => {
    it('should handle SDK errors gracefully', async () => {
      // Mock SDK to throw error
      jest.spyOn(sdk, 'query').mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      const ctx = mockTelegramContext('chat1', '/analyze AAPL');
      await bot.handleAnalyzeCommand(ctx);

      // Error shown to user
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      );

      // Session marked as error
      const sessions = sessionManager['sessions'].get('chat1');
      expect(sessions![0].metrics.errors).toBe(1);
    });
  });

  describe('Session Expiration', () => {
    it('should expire sessions after timeout', async () => {
      jest.useFakeTimers();

      // Create session
      const session = sessionManager.createSession('chat1', 'AAPL');

      // Fast-forward 1 hour
      jest.advanceTimersByTime(3600000);

      // Trigger cleanup
      sessionManager.cleanupExpiredSessions();

      // Session no longer active
      const activeSession = sessionManager.getActiveSession('chat1');
      expect(activeSession).toBeNull();

      jest.useRealTimers();
    });
  });
});
```

### 6.2 Performance Tests

**Test File**: `libs/e2e/agent-e2e/src/agent/performance.spec.ts`

```typescript
describe('Performance Tests', () => {

  it('should handle 10 concurrent sessions', async () => {
    const promises = [];

    for (let i = 1; i <= 10; i++) {
      promises.push(
        bot.handleAnalyzeCommand(
          mockTelegramContext(`chat${i}`, '/analyze AAPL')
        )
      );
    }

    await Promise.all(promises);

    // All sessions created
    for (let i = 1; i <= 10; i++) {
      const session = sessionManager.getActiveSession(`chat${i}`);
      expect(session).not.toBeNull();
    }
  });

  it('should complete analysis within 60 seconds', async () => {
    const startTime = Date.now();

    await bot.handleAnalyzeCommand(
      mockTelegramContext('chat1', '/analyze AAPL')
    );
    await waitForCompletion();

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(60000);
  });

  it('should not leak memory with 100 sessions', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Create and complete 100 sessions
    for (let i = 1; i <= 100; i++) {
      sessionManager.createSession('chat1', `TICK${i}`);
      sessionManager.completeSession('chat1', 'Analysis', 'Summary');
    }

    // Force garbage collection
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

    // Should not increase by more than 50MB
    expect(memoryIncrease).toBeLessThan(50);
  });

  it('should cleanup expired sessions efficiently', async () => {
    jest.useFakeTimers();

    // Create 50 sessions
    for (let i = 1; i <= 50; i++) {
      const session = sessionManager.createSession(`chat${i}`, 'AAPL');
      session.expiresAt = new Date(Date.now() - 1000); // All expired
    }

    const startTime = Date.now();
    sessionManager.cleanupExpiredSessions();
    const duration = Date.now() - startTime;

    // Cleanup should be fast (< 100ms)
    expect(duration).toBeLessThan(100);

    // All sessions removed
    expect(sessionManager['sessions'].size).toBe(0);

    jest.useRealTimers();
  });
});
```

**Acceptance Criteria**:
- All E2E tests pass
- Performance tests meet targets
- No memory leaks detected
- Error handling works correctly

---

## Phase 7: Documentation

**Duration**: 2-3 days

### 7.1 Update Project Documentation

**Files to Create/Update**:

1. **`docs/ARCHITECTURE.md`** - System architecture overview
2. **`docs/SESSION_MANAGEMENT.md`** - Session management guide
3. **`docs/HOOKS_GUIDE.md`** - Hook development guide
4. **`docs/STREAMING_ARCHITECTURE.md`** - Event streaming design
5. **`docs/TESTING_GUIDE.md`** - Testing strategy and utilities
6. **`CLAUDE.md`** - Update with new services and patterns
7. **`README.md`** - Update with new features

### 7.2 Code Documentation

**Add JSDoc Comments**:

```typescript
/**
 * SessionManagerService manages analysis sessions and conversation history.
 *
 * Features:
 * - Creates sessions with 1-hour expiration
 * - Tracks conversation history
 * - Builds context prompts for follow-ups
 * - Automatic cleanup of expired sessions
 *
 * @example
 * ```typescript
 * const session = sessionManager.createSession('chat1', 'AAPL');
 * sessionManager.addMessage('chat1', 'user', 'What is the P/E?');
 * const context = sessionManager.buildContextPrompt('chat1', 'Next question');
 * ```
 */
@Injectable()
export class SessionManagerService {
  // ...
}
```

**Acceptance Criteria**:
- All public methods have JSDoc comments
- All services have usage examples
- Architecture diagrams created
- Migration guide written

---

## Testing Strategy Summary

### Test Coverage Goals

| Component | Unit | Integration | E2E | Total |
|-----------|------|-------------|-----|-------|
| SessionManager | 90% | 10% | - | 90% |
| HooksService | 90% | 10% | - | 90% |
| AgentService | 70% | 20% | 10% | 80% |
| TelegramBot | 60% | 30% | 10% | 75% |
| **Overall** | **75%** | **20%** | **5%** | **80%** |

### Test Pyramid

```
           E2E (5%)
         /          \
    Integration (20%)
       /            \
   Unit Tests (75%)
```

### Critical Paths (100% Coverage Required)

1. ✅ Session lifecycle (create → active → complete/stop/expire)
2. ✅ Hook execution (onMessage, onToolUse, onToolResult)
3. ✅ Context building (recent sessions + conversation history)
4. ✅ Event emission (all message types)
5. ✅ Error handling (SDK errors, hook errors, validation errors)

### Testing Tools

- **Unit**: Jest + NestJS Testing
- **Integration**: Jest + Supertest
- **E2E**: Jest + Mock SDK streams
- **Performance**: Jest + node --expose-gc
- **Coverage**: Istanbul/nyc

---

## Timeline & Milestones

| Phase | Duration | Milestone |
|-------|----------|-----------|
| 1. Foundation | 3-4 days | ✅ Test infrastructure ready |
| 2. Sessions | 5-6 days | ✅ SessionManager complete + tested |
| 3. Hooks | 5-6 days | ✅ HooksService complete + tested |
| 4. Agent | 6-7 days | ✅ Enhanced Agent with streaming |
| 5. Bot | 5-6 days | ✅ Conversation mode working |
| 6. Integration | 4-5 days | ✅ All E2E tests pass |
| 7. Documentation | 2-3 days | ✅ Docs complete |
| **Total** | **30-37 days** | **~6-7 weeks** |

---

## Success Criteria

### Functional Requirements

- ✅ Sessions persist for 1 hour
- ✅ Conversation mode works with context
- ✅ **ALL 7 SDK message types handled:**
  - `SDKAssistantMessage` - Complete assistant responses
  - `SDKUserMessage` - User inputs and tool results
  - `SDKUserMessageReplay` - Replayed messages (logged)
  - `SDKResultMessage` - Final results with cost/duration
  - `SDKSystemMessage` - System initialization
  - `SDKPartialAssistantMessage` - Real-time streaming
  - `SDKCompactBoundaryMessage` - Conversation compaction
- ✅ Hooks execute at correct points
- ✅ Cross-session comparisons work
- ✅ Session conflicts resolved gracefully
- ✅ Commands work (/analyze, /stop, /status)

### Non-Functional Requirements

- ✅ Test coverage ≥ 80%
- ✅ No memory leaks (100 sessions test)
- ✅ Analysis completes in < 60s
- ✅ Cleanup efficient (< 100ms for 50 sessions)
- ✅ Concurrent sessions supported (10+)
- ✅ Error handling comprehensive

### User Experience

- ✅ Natural conversation flow
- ✅ Real-time streaming maintained
- ✅ Clear session status visibility
- ✅ Graceful error messages
- ✅ Fast response times

---

## Risk Mitigation

### High-Risk Areas

1. **Session Memory Leaks**
   - **Risk**: Sessions not cleaned up properly
   - **Mitigation**: Automatic cleanup + tests
   - **Monitoring**: Memory usage tests

2. **Event Emission Bottlenecks**
   - **Risk**: Too many events slow down system
   - **Mitigation**: Throttling + batching
   - **Monitoring**: Latency tracking

3. **Hook Performance Impact**
   - **Risk**: Hooks slow down tool execution
   - **Mitigation**: Async execution + timeouts
   - **Monitoring**: Hook duration metrics

4. **Context Size Growth**
   - **Risk**: Context prompts become too large
   - **Mitigation**: Limit to 5 sessions + summarization
   - **Monitoring**: Token usage tracking

### Testing Risks

1. **Flaky Tests**
   - **Risk**: Timing-dependent tests fail randomly
   - **Mitigation**: Use fake timers, avoid sleeps

2. **Mock Complexity**
   - **Risk**: Mocks diverge from real behavior
   - **Mitigation**: Integration tests with real components

---

## Next Steps

After completing this refactor:

1. **Monitor Production** (2 weeks)
   - Track metrics (memory, latency, errors)
   - Gather user feedback
   - Identify performance bottlenecks

2. **Optimize** (1 week)
   - Implement caching hooks
   - Add budget tracking
   - Optimize context building

3. **Extend** (ongoing)
   - Add more tool integrations
   - Implement advanced hooks
   - Add analytics dashboard

---

## Appendix: Key Files

### New Files Created

```
libs/agent/session/
  ├── src/lib/session-manager.service.ts
  ├── src/lib/session-manager.service.spec.ts
  └── src/lib/interfaces/analysis-session.interface.ts

libs/agent/hooks/
  ├── src/lib/hooks.service.ts
  ├── src/lib/hooks.service.spec.ts
  └── src/lib/interfaces/hook-types.ts

libs/agent/core/src/test-utils/
  ├── mock-sdk-stream.ts
  ├── mock-session.ts
  └── mock-telegram.ts

test-fixtures/
  ├── sample-data.ts
  └── sample-streams.ts

docs/
  ├── ARCHITECTURE.md
  ├── SESSION_MANAGEMENT.md
  ├── HOOKS_GUIDE.md
  ├── STREAMING_ARCHITECTURE.md
  └── TESTING_GUIDE.md

libs/e2e/agent-e2e/src/agent/
  ├── full-flow.spec.ts
  └── performance.spec.ts
```

### Modified Files

```
libs/agent/core/src/lib/
  ├── agent.service.ts (major refactor)
  ├── agent.service.spec.ts (expanded)
  └── agent.module.ts (add new services)

libs/bot/telegram/src/lib/
  ├── telegram-bot.service.ts (major refactor)
  ├── telegram-bot.service.spec.ts (expanded)
  └── stream-manager.service.ts (minor updates)

libs/shared/types/src/lib/
  └── enums.ts (add new event types)

CLAUDE.md (architecture updates)
README.md (feature updates)
```

---

## Conclusion

This refactor transforms the Stock Analyzer Agent from a simple query-response system into an intelligent, conversational agent with:

- **Session Management** - 1-hour conversational memory
- **Complete SDK Streaming** - All message types, hooks, granular events
- **Intelligent Hooks** - Validation, budgets, caching, enhancement
- **Two Modes** - Workflow (new analysis) + Conversation (follow-ups)
- **Context Awareness** - Cross-session comparisons

The test-driven approach ensures zero regressions while adding significant new capabilities. The 6-7 week timeline allows for thorough testing and documentation.

Ready to proceed with Phase 1! 🚀
