# Persistent Chat Sessions: Refactoring Plan

**Status**: Planning Phase
**Created**: 2025-10-13
**Goal**: Transform sessions from ticker-scoped, time-limited analysis contexts into chat-scoped, persistent conversation contexts with simplified state management

---

## Executive Summary

### Current Architecture
- Sessions are **ticker-scoped** and **analysis-scoped** (one session per AAPL analysis)
- Sessions have 4 states: ACTIVE → COMPLETED → (1hr timeout) → EXPIRED
- Conversation mode is a separate **WorkflowType** requiring explicit routing
- Sessions auto-expire after 1 hour of inactivity
- User must explicitly choose between workflow and conversation modes

### Target Architecture
- Sessions are **chat-scoped** and **persistent** (one ongoing session per chat)
- Sessions have 2 states: ACTIVE (default) → STOPPED (manual /new command)
- Conversation mode is the **default behavior** (not a workflow type)
- Sessions persist indefinitely until user explicitly resets
- Workflows are **events within a session** (don't change session state)

### Key Benefits
1. **Seamless UX**: Users can freely mix workflows and freeform questions
2. **Context Retention**: All interactions in a chat share the same session context
3. **Simpler State Machine**: Only 2 states instead of 4
4. **Natural Flow**: Conversation is default, workflows are optional enhancements
5. **No Arbitrary Timeouts**: Sessions end only when user wants

---

## Implementation Phases

### Phase 1: Session Model & Storage (Foundation)
### Phase 2: Agent Service (Core Logic)
### Phase 3: API Layer (Endpoints)
### Phase 4: Telegram Bot (User Interface)
### Phase 5: Testing & Migration
### Phase 6: Documentation & Deployment

---

## Phase 1: Session Model & Storage (Foundation)

### 1.1 Rename & Update Session Interface

**Files**:
- `libs/bot/sessions/src/lib/session-store/interfaces/session.interface.ts`
- All files importing `AnalysisSession` type

**Why Rename?**
The name `AnalysisSession` reflects the old architecture where sessions were analysis-scoped. The new architecture has **chat-scoped** sessions that support ANY interaction (conversation, workflows, etc.), not just analysis. The name `ChatSession` accurately reflects this.

**Changes**:

### BEFORE (Current - To Be Replaced)

```typescript
export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
  EXPIRED = 'expired',
}

export interface AnalysisSession {  // ❌ OLD NAME - analysis-scoped
  sessionId: string;          // Format: "chat123-AAPL-1234567890"
  chatId: number;
  ticker: string;             // Session is ticker-specific
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;           // Auto-expiration timestamp
  conversationHistory: ConversationMessage[];
  metadata?: {
    fullAnalysis?: string;
    executiveSummary?: string;
  };
}
```

### AFTER (New - Target Architecture)

```typescript
export enum SessionStatus {
  ACTIVE = 'active',          // Default state
  STOPPED = 'stopped',        // Manually ended via /new or /reset
}

export interface WorkflowExecution {
  workflowId: string;
  workflowType: WorkflowType;
  ticker?: string;            // Some workflows are ticker-specific
  startedAt: Date;
  completedAt?: Date;
  result?: string;            // Workflow output/summary
  metadata?: Record<string, unknown>;
}

export interface ChatSession {  // ✅ NEW NAME - chat-scoped
  sessionId: string;          // Format: "chat123-1234567890" (no ticker)
  chatId: number;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  // REMOVED: expiresAt, ticker
  conversationHistory: ConversationMessage[];
  workflows: WorkflowExecution[];  // NEW: Track workflows executed
  metadata?: Record<string, unknown>;
}
```

**Implementation Notes**:
- **Rename interface**: `AnalysisSession` → `ChatSession` throughout codebase
- Remove `expiresAt` field entirely (no auto-expiration)
- Remove `ticker` field from session (not ticker-scoped)
- Add `workflows` array to track workflow executions within session
- Simplify `SessionStatus` to only ACTIVE and STOPPED
- `sessionId` format changes from `chat-ticker-timestamp` to `chat-timestamp`

**Files Affected by Rename**:
- Session interface definition
- SessionOrchestratorService (all method signatures)
- Session repository/storage layer
- Telegram bot service (all session references)
- Stream manager service
- All test files

**Testing Considerations**:
- [ ] Unit tests for session creation without ticker
- [ ] Verify sessionId format generation
- [ ] Test workflow execution tracking
- [ ] Ensure backward compatibility with existing session data (migration)
- [ ] Update all imports throughout codebase
- [ ] Verify TypeScript compilation after rename

---

### 1.2 Update Session Orchestrator Service

**Files**:
- `libs/bot/sessions/src/lib/session-store/session-orchestrator.service.ts`

**Changes**:

```typescript
// BEFORE
class SessionOrchestratorService {
  createSession(chatId: number, ticker: string): AnalysisSession
  getActiveSession(chatId: number): AnalysisSession | null
  getCompletedSession(chatId: number): AnalysisSession | null
  completeSession(chatId: number, fullAnalysis: string, summary: string): void
  stopSession(chatId: number): void
  private cleanupExpiredSessions(): void  // Runs every 5 minutes
}

// AFTER
class SessionOrchestratorService {
  // NEW: Primary method - always returns a session
  getOrCreateSession(chatId: number): ChatSession

  // Get current session (returns null if STOPPED or doesn't exist)
  getSession(chatId: number): ChatSession | null

  // Manual stop only (sets status to STOPPED)
  stopSession(chatId: number, reason?: string): void

  // Track workflow execution within session (creates record, doesn't execute)
  trackWorkflow(
    chatId: number,
    workflowType: WorkflowType,
    ticker?: string
  ): string  // Returns workflowId

  completeWorkflow(
    chatId: number,
    workflowId: string,
    result: string
  ): void

  // Add message to conversation history
  addMessage(
    chatId: number,
    role: MessageRole,
    content: string
  ): void

  // REMOVED: getActiveSession, getCompletedSession, completeSession
  // REMOVED: cleanupExpiredSessions (or only cleans STOPPED sessions older than X days)
}
```

**Implementation Details**:

```typescript
getOrCreateSession(chatId: number): ChatSession {
  // 1. Check for existing ACTIVE session
  const existing = this.sessionRepository.findByChatId(chatId);
  if (existing && existing.status === SessionStatus.ACTIVE) {
    return existing;
  }

  // 2. Create new session if none exists or previous was STOPPED
  const sessionId = this.generateSessionId(chatId);  // chat123-1234567890
  const newSession: ChatSession = {
    sessionId,
    chatId,
    status: SessionStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    conversationHistory: [],
    workflows: [],
    metadata: {},
  };

  this.sessionRepository.save(newSession);
  this.logger.log(`Created new session: ${sessionId}`);
  return newSession;
}

trackWorkflow(
  chatId: number,
  workflowType: WorkflowType,
  ticker?: string
): string {
  const session = this.getSession(chatId);
  if (!session) {
    throw new Error('No active session found');
  }

  const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const execution: WorkflowExecution = {
    workflowId,
    workflowType,
    ticker,
    startedAt: new Date(),
  };

  session.workflows.push(execution);
  session.updatedAt = new Date();
  this.sessionRepository.update(session);

  return workflowId;
}
```

**Migration Strategy**:
- Existing sessions with COMPLETED status → Convert to ACTIVE
- Existing sessions with EXPIRED status → Delete or convert to STOPPED
- Existing ticker-scoped sessionIds → Generate new chat-scoped sessionIds
- Preserve conversation history during migration

**Testing Considerations**:
- [ ] Test getOrCreateSession returns existing ACTIVE session
- [ ] Test getOrCreateSession creates new session when none exists
- [ ] Test getOrCreateSession creates new session when previous was STOPPED
- [ ] Test workflow execution tracking
- [ ] Test message addition to conversation history
- [ ] Integration test: Session persists across multiple workflows

---

## Phase 2: Agent Service (Core Logic)

### 2.1 Remove Conversation Workflow Type

**Files**:
- `libs/shared/types/src/lib/enums.ts`
- `libs/agent/core/src/lib/workflows/workflow-registry.ts`

**Changes**:

```typescript
// BEFORE - libs/shared/types/src/lib/enums.ts
export enum WorkflowType {
  STOCK_ANALYSIS = 'stock_analysis',
  CONVERSATION = 'conversation',  // REMOVE THIS
}

// AFTER
export enum WorkflowType {
  STOCK_ANALYSIS = 'stock_analysis',
  // Conversation is not a workflow - it's the default mode
}
```

**Workflow Registry Cleanup**:

```typescript
// BEFORE - libs/agent/core/src/lib/workflows/workflow-registry.ts
private initializeWorkflows() {
  this.workflows.set(WorkflowType.STOCK_ANALYSIS, stockAnalysisWorkflow);
  this.workflows.set(WorkflowType.CONVERSATION, conversationWorkflow);  // REMOVE
}

// AFTER
private initializeWorkflows() {
  this.workflows.set(WorkflowType.STOCK_ANALYSIS, stockAnalysisWorkflow);
  // Conversation mode uses base system prompt, not a workflow
}
```

**Testing Considerations**:
- [ ] Verify WorkflowType enum is updated everywhere
- [ ] Check all references to CONVERSATION workflow are removed
- [ ] Ensure no broken imports

---

### 2.2 Add Freeform Conversation to Agent Service

**Files**:
- `libs/agent/core/src/lib/agent.service.ts`

**Key Change**: Both workflows and conversations use the **same base system prompt**. No need for separate prompts.

**New Method**:

```typescript
// libs/agent/core/src/lib/agent.service.ts
export class AgentService {

  // Existing method - unchanged
  async executeWorkflow(
    sessionId: string,
    workflowType: WorkflowType,
    params: WorkflowParams
  ): Promise<AnalysisResult> {
    // ... existing implementation (uses workflowConfig.systemPrompt)
  }

  // NEW method for freeform conversation
  async executeConversation(
    sessionId: string,
    userMessage: string,
    conversationHistory: ConversationMessage[]
  ): Promise<string> {
    this.logger.log(`[${sessionId}] Starting conversation`);

    // Build context from conversation history
    const contextMessages = this.buildConversationContext(conversationHistory);

    // Get workflow config (reuse for model settings)
    const workflowConfig = this.workflowService.getConfig(WorkflowType.STOCK_ANALYSIS);

    // Execute query - SAME systemPrompt as workflows
    const stream = query({
      prompt: userMessage,
      options: {
        systemPrompt: workflowConfig.systemPrompt,  // SAME prompt as workflows
        model: workflowConfig.model,
        maxThinkingTokens: workflowConfig.maxThinkingTokens,
        maxTurns: workflowConfig.maxTurns,
        permissionMode: 'bypassPermissions',
        mcpServers: {
          'stock-analyzer': this.mcpServer,  // All tools available
        },
        conversationHistory: contextMessages,  // NEW: Pass conversation history
      },
    });

    // Process stream using shared method
    const fullContent = await this.processStreamMessages(
      stream,
      sessionId,
      '',  // ticker (empty for conversations)
      'conversation',
      true  // streamToClient
    );

    // Emit completion event
    this.eventEmitter.emit(`stream.${sessionId}`, {
      type: StreamEventType.COMPLETE,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`[${sessionId}] Conversation completed`);
    return fullContent;
  }

  // NEW: Extract stream processing into shared private method
  private async processStreamMessages(
    stream: AsyncIterable<SDKMessage>,
    sessionId: string,
    ticker: string,
    workflowType: WorkflowType | string,
    streamToClient: boolean
  ): Promise<string> {
    let fullContent = '';
    let totalTokens = 0;

    for await (const message of stream) {
      this.logger.log(`[${sessionId}] ━━━ Message Type: ${message.type} ━━━`);

      try {
        switch (message.type) {
          case 'system':
            if ('subtype' in message && message.subtype === 'init') {
              this.handleSystemInitMessage(message as SDKSystemMessage, sessionId, ticker, streamToClient);
            } else if ('subtype' in message && message.subtype === 'compact_boundary') {
              this.handleCompactBoundaryMessage(message as SDKCompactBoundaryMessage, sessionId, ticker, streamToClient);
            }
            break;

          case 'stream_event':
            this.handlePartialAssistantMessage(message as SDKPartialAssistantMessage, sessionId, ticker, streamToClient);
            break;

          case 'assistant':
            const assistantMsg = message as SDKAssistantMessage;
            const textContent = this.handleAssistantMessage(assistantMsg, sessionId, ticker, workflowType, streamToClient);
            fullContent += textContent;

            // Track token usage
            if (assistantMsg.message.usage) {
              totalTokens += assistantMsg.message.usage.input_tokens + assistantMsg.message.usage.output_tokens;
            }
            break;

          case 'user':
            this.handleUserMessage(message as SDKUserMessage, sessionId, ticker, streamToClient);
            break;

          case 'result':
            this.handleResultMessage(message as SDKResultMessage, sessionId, ticker, totalTokens, streamToClient);
            break;

          default:
            this.handleUnknownMessage(message, sessionId);
            break;
        }
      } catch (messageError) {
        this.logger.error(`[${sessionId}] Error processing message:`, messageError);
        // Continue processing other messages
      }
    }

    return fullContent;
  }

  private buildConversationContext(
    history: ConversationMessage[]
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    // Convert conversation history to SDK format
    // Include recent context (last N messages or within token limit)
    return history.slice(-10).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  }
}
```

**Implementation Notes**:
- **Same system prompt** for both workflows and conversations (no separate prompt needed)
- **NEW: Shared stream processing** - Extract stream processing into `processStreamMessages()` method
- **Refactor existing code**: Update `executeQuery()` to also call `processStreamMessages()` (DRY principle)
- Conversation mode has access to ALL tools (same as workflows)
- Uses same model settings (maxThinkingTokens, maxTurns, etc.)
- NEW: Passes `conversationHistory` to query options for context retention
- Ticker parameter empty string `''` since conversations aren't ticker-specific

**Refactoring Pattern**:
```typescript
// BEFORE (in executeQuery):
for await (const message of stream) {
  switch (message.type) { /* ... 60+ lines of code ... */ }
}
return fullContent;

// AFTER (in both executeQuery and executeConversation):
const fullContent = await this.processStreamMessages(stream, sessionId, ticker, workflowType, streamToClient);
return fullContent;
```

**Context Management**:
- Sliding window: Keep last 10 messages from conversation history
- SDK handles compaction automatically when context grows too large
- Compaction events are emitted via existing handleCompactBoundaryMessage
- Bot notifies user when compaction occurs (via COMPACTION event type)

**Testing Considerations**:
- [ ] Unit test: executeConversation with empty history
- [ ] Unit test: executeConversation with conversation history
- [ ] Unit test: buildConversationContext truncation (last 10 messages)
- [ ] Integration test: Conversation with tool usage
- [ ] Integration test: Multi-turn conversation with context retention
- [ ] Integration test: Verify same system prompt used as workflows

---

## Phase 3: API Layer (Endpoints)

### 3.1 Rename Controller & Add Conversation Endpoint

**Files**:
- `libs/agent/api/src/lib/analysis.controller.ts` → **RENAME** to `agent.controller.ts`
- `libs/agent/api/src/lib/dto/conversation.dto.ts` (NEW)

**Why Rename?**
- Current name "AnalysisController" is too narrow (only reflects workflows)
- New name "AgentController" reflects both workflows AND conversations
- Both are agent executions with SSE streaming
- Unified controller is simpler than separate controllers

**New DTO**:

```typescript
// libs/agent/api/src/lib/dto/conversation.dto.ts
import { IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ConversationMessageDto {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  content: string;

  @IsOptional()
  timestamp?: string;
}

export class ConversationRequestDto {
  @IsString()
  sessionId: string;

  @IsString()
  userMessage: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  conversationHistory: ConversationMessageDto[];
}
```

**Updated Controller** (with both endpoints):

```typescript
// libs/agent/api/src/lib/agent.controller.ts (RENAMED from analysis.controller.ts)

/**
 * Agent Controller - Handles workflow and conversation execution via SSE
 */
@Controller('api')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private agentService: AgentService,
    private streamService: AgentStreamService
  ) {}

  /**
   * Execute Workflow with SSE Streaming
   * Route: POST /api/workflow
   */
  @Post('workflow')
  async executeWorkflow(
    @Body() body: WorkflowRequest,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // ... existing implementation (unchanged)
  }

  /**
   * Execute Conversation with SSE Streaming
   * Route: POST /api/conversation (NEW)
   */
  @Post('conversation')
  async executeConversation(
    @Body() body: ConversationRequestDto,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const { sessionId, userMessage, conversationHistory } = body;

    this.logger.log(
      `[${sessionId}] Starting conversation with SSE streaming`
    );

    // Set SSE headers (MUST be 200 for EventSource compatibility)
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Register SSE connection
    this.streamService.registerStream(sessionId, res);

    // Send connected event
    this.sendSseEvent(res, {
      type: 'connected',
      sessionId,
      timestamp: new Date().toISOString()
    });

    // Execute conversation (results stream via EventEmitter to StreamService)
    this.agentService
      .executeConversation(sessionId, userMessage, conversationHistory)
      .then((result) => {
        this.logger.log(`[${sessionId}] Conversation complete`);
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`[${sessionId}] Conversation failed: ${errorMessage}`);

        // Send error event
        this.sendSseEvent(res, {
          type: 'error',
          message: errorMessage,
          timestamp: new Date().toISOString()
        });

        // Clean up
        this.streamService.closeStream(sessionId);
      });

    // Handle client disconnect
    req.on('close', () => {
      this.logger.log(`[${sessionId}] Client disconnected`);
      this.streamService.closeStream(sessionId);
    });
  }

  /**
   * Helper method to send SSE events
   * Centralizes the SSE format: data: {...}\n\n
   */
  private sendSseEvent(res: Response, data: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
```

**Implementation Notes**:
- **Rename file**: `analysis.controller.ts` → `agent.controller.ts`
- **Rename class**: `AnalysisController` → `AgentController`
- **Unified controller**: Both endpoints in same file (@Controller('api'))
- **Routes**:
  - POST `/api/workflow` (existing - update to use sendSseEvent)
  - POST `/api/conversation` (new)
- **NEW: Shared SSE helper** - Extract `res.write()` into `sendSseEvent()` private method
- **Refactor existing code**: Update `executeWorkflow()` to also use `sendSseEvent()` (DRY principle)
- **Same SSE pattern** as workflow endpoint (Express res/req, manual headers, AgentStreamService)
- **Event types**: connected, chunk, thinking, tool, tool_result, result, complete, error
- **No ticker parameter**: Pass empty string `''` to handlers since conversations aren't ticker-specific
- **Promise-based**: `executeConversation()` returns `Promise<string>` (like executeWorkflow)
- **StreamService integration**: Uses existing AgentStreamService to forward events to SSE

**Refactoring Pattern**:
```typescript
// BEFORE (in executeWorkflow and executeConversation):
res.write(`data: ${JSON.stringify({ type: 'connected', ... })}\n\n`);
res.write(`data: ${JSON.stringify({ type: 'error', ... })}\n\n`);

// AFTER (in both methods):
this.sendSseEvent(res, { type: 'connected', ... });
this.sendSseEvent(res, { type: 'error', ... });
```

**Testing Considerations**:
- [ ] Unit test: DTO validation
- [ ] Integration test: POST /api/conversation returns SSE stream with correct headers
- [ ] Integration test: Conversation with tool usage
- [ ] Integration test: Client disconnect cleanup
- [ ] E2E test: Full conversation flow from bot to agent

---

## Phase 4: Telegram Bot (User Interface)

### 4.1 Centralize Bot Messages

**Files**:
- `libs/bot/common/src/lib/messages.ts` (NEW)

**Why Centralize?**
- Single source of truth for all user-facing messages
- Easy to update message content and formatting
- Consistent tone across all bot interactions
- Easier to test and review messages
- Future-proof for localization/i18n

**Messages File**:

```typescript
// libs/bot/common/src/lib/messages.ts

/**
 * Type definition for bot messages
 * Supports both static strings and parameterized message functions
 */
export interface BotMessagesType {
  // Session management
  NEW_SESSION: string;
  NEW_SESSION_FAILED: string;
  NO_ACTIVE_SESSION: string;

  // Errors
  GENERIC_ERROR: string;
  UNABLE_TO_IDENTIFY_CHAT: string;
  ANALYSIS_FAILED: (ticker: string) => string;
  SESSION_STATUS_FAILED: string;
  WAIT_FOR_RESPONSE: string;

  // Conversation
  CONTEXT_COMPACTED: string;
  CONVERSATION_FAILED: string;

  // Commands
  ANALYZE_USAGE: string;
  STARTING_ANALYSIS: (ticker: string) => string;

  // Help
  HELP_TEXT: string;
}

/**
 * Centralized bot messages for consistent user communication
 * All user-facing messages should be defined here
 */
export const BotMessages: BotMessagesType = {
  // Session management
  NEW_SESSION: `Started a new conversation session.

You can:
• Ask me any financial questions
• Use /analyze TICKER for full stock analysis
• Use /status to see current session info
• Use /help for more commands`,

  NEW_SESSION_FAILED: 'Failed to start new session. Please try again.',

  NO_ACTIVE_SESSION: `No active session.

Use /new to start a conversation or /analyze TICKER for stock analysis.`,

  // Errors
  GENERIC_ERROR: `Sorry, something went wrong. Try:
• /new to start fresh
• /status to check session
• /help for assistance`,

  UNABLE_TO_IDENTIFY_CHAT: 'Unable to identify chat. Please try again.',

  ANALYSIS_FAILED: (ticker: string) =>
    `Failed to start analysis for ${ticker}. Please try again.`,

  SESSION_STATUS_FAILED: 'Failed to get session status.',

  WAIT_FOR_RESPONSE: '⏳ Please wait for the current response to complete...',

  // Conversation
  CONTEXT_COMPACTED: `Context has grown large and was compacted to maintain performance.

You can continue chatting, or use /new to start completely fresh.`,

  CONVERSATION_FAILED: 'Failed to start conversation. Please try again.',

  // Commands
  ANALYZE_USAGE: `Usage: /analyze TICKER
Example: /analyze AAPL`,

  STARTING_ANALYSIS: (ticker: string) => `📊 Starting analysis for ${ticker}...`,

  // Help
  HELP_TEXT: `Stock Analyzer Bot

Commands:
/analyze TICKER - Full stock analysis
/status - View session info
/new or /reset - Start fresh session
/help - Show this message

You can also ask me any financial questions directly!`,
};
```

**Export from index**:

```typescript
// libs/bot/common/src/index.ts
export * from './lib/messages';
```

---

### 4.2 Add /new Command

**Files**:
- `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Update setupBot() to register new commands**:

```typescript
// libs/bot/telegram/src/lib/telegram-bot.service.ts
import { BotMessages } from '@stock-analyzer/bot/common';

export class TelegramBotService {

  private async setupBot() {
    // Command handlers
    this.bot.command('start', this.handleStartCommand.bind(this));
    this.bot.command('analyze', this.handleAnalyzeCommand.bind(this));
    this.bot.command('stop', this.handleStopCommand.bind(this));
    this.bot.command('status', this.handleStatusCommand.bind(this));
    this.bot.command('help', this.handleHelpCommand.bind(this));
    this.bot.command('new', this.handleNewCommand.bind(this));      // NEW
    this.bot.command('reset', this.handleResetCommand.bind(this));  // NEW (alias)

    // Message handlers - route to conversation or analysis
    this.bot.on('text', this.handleTextMessage.bind(this));

    // Error handling
    this.bot.catch((err: unknown, ctx) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Bot error: ${errorMessage}`);
      ctx.reply('An error occurred. Please try again.').catch(() => {
        // Ignore reply failures
      });
    });
  }

  // NEW: Handler for /new command
  private async handleNewCommand(ctx: Context) {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    try {
      // Stop current session (if exists)
      const currentSession = this.sessionOrchestrator.getSession(chatId);
      if (currentSession) {
        this.sessionOrchestrator.stopSession(chatId, 'User started new session');
        this.logger.log(`[${chatId}] Stopped session: ${currentSession.sessionId}`);
      }

      // Create new session
      const newSession = this.sessionOrchestrator.getOrCreateSession(chatId);
      this.logger.log(`[${chatId}] Created new session: ${newSession.sessionId}`);

      await ctx.reply(BotMessages.NEW_SESSION);
    } catch (error) {
      this.logger.error(`[${chatId}] Error starting new session:`, error);
      await ctx.reply(BotMessages.NEW_SESSION_FAILED);
    }
  }

  // NEW: Alias for /new command
  private async handleResetCommand(ctx: Context) {
    return this.handleNewCommand(ctx);
  }
}
```

**Implementation Notes**:
- `/new` and `/reset` are aliases (both do the same thing)
- Stops current session (status → STOPPED)
- Creates fresh session with no conversation history
- User-friendly explanation of what they can do

**Testing Considerations**:
- [ ] Test /new with existing ACTIVE session
- [ ] Test /new with no existing session
- [ ] Test /reset is alias for /new
- [ ] Verify session is properly stopped and new one created

---

### 4.3 Update Text Handler (Default to Conversation)

**Files**:
- `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Updated handleTextMessage() - already registered in setupBot()**:

```typescript
// libs/bot/telegram/src/lib/telegram-bot.service.ts
// Note: Already registered via this.bot.on('text', this.handleTextMessage.bind(this))

private async handleTextMessage(ctx: Context) {
  const message = ctx.message as any;
  const text = message?.text || '';
  const chatId = ctx.chat?.id.toString();

  if (!chatId) return;

  // Check if bot is currently responding - block input
  if (this.streamManager.isResponding(chatId)) {
    await ctx.reply(BotMessages.WAIT_FOR_RESPONSE);
    return;
  }

  try {
    await ctx.sendChatAction('typing');

    // Execute conversation (StreamManager handles session, history, and execution)
    await this.streamManager.executeConversation(chatId, text, ctx);
  } catch (error) {
    this.logger.error(`[${chatId}] Error executing conversation:`, error);
    await ctx.reply(BotMessages.CONVERSATION_FAILED);
  }
}
```

**Key Changes**:
- **Simplified bot logic** - Single method call to execute conversation
- StreamManager handles all implementation details internally (session, history, tracking)
- All non-command text routes to conversation mode by default
- No explicit workflow detection needed (user uses commands for workflows)

**Implementation Notes**:
- Bot only contains business logic (user sent a message → execute conversation)
- Service layer handles session management, history tracking, and execution
- Session persists across all interactions
- No conflict detection needed (session is chat-scoped, not ticker-scoped)

**Testing Considerations**:
- [ ] Test text input creates session if none exists
- [ ] Test text input uses existing session
- [ ] Test message is added to conversation history
- [ ] Test conversation stream is started

---

### 4.4 Update Workflow Commands

**Files**:
- `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Updated handleAnalyzeCommand() - already registered in setupBot()**:

```typescript
// libs/bot/telegram/src/lib/telegram-bot.service.ts
// Note: Already registered via this.bot.command('analyze', this.handleAnalyzeCommand.bind(this))

private async handleAnalyzeCommand(ctx: Context) {
  const message = ctx.message as any;
  const text = message?.text || '';
  const ticker = text.split(' ')[1]?.toUpperCase();
  const chatId = ctx.chat?.id.toString();

  if (!ticker) {
    await ctx.reply(BotMessages.ANALYZE_USAGE);
    return;
  }

  if (!chatId) {
    await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
    return;
  }

  // Check if bot is currently responding
  if (this.streamManager.isResponding(chatId)) {
    await ctx.reply(BotMessages.WAIT_FOR_RESPONSE);
    return;
  }

  try {
    await ctx.sendChatAction('typing');
    await ctx.reply(BotMessages.STARTING_ANALYSIS(ticker));

    // Execute workflow (StreamManager handles session, tracking, and execution)
    await this.streamManager.executeWorkflow(
      chatId,
      WorkflowType.STOCK_ANALYSIS,
      ticker,
      ctx
    );
  } catch (error) {
    this.logger.error(`[${chatId}] Error executing workflow:`, error);
    await ctx.reply(BotMessages.ANALYSIS_FAILED(ticker));
  }
}
```

**Key Changes**:
- **Simplified bot logic** - Single method call to execute workflow
- StreamManager handles all implementation details internally
- Session persists after workflow completes (no status change)
- Workflow is an event within the session, not a state transition

**Updated handleStatusCommand() - already registered in setupBot()**:

```typescript
// libs/bot/telegram/src/lib/telegram-bot.service.ts
// Note: Already registered via this.bot.command('status', this.handleStatusCommand.bind(this))

private async handleStatusCommand(ctx: Context) {
  const chatId = ctx.chat?.id.toString();
  if (!chatId) return;

  try {
    const session = this.sessionOrchestrator.getSession(chatId);

    if (!session) {
      await ctx.reply(BotMessages.NO_ACTIVE_SESSION);
      return;
    }

    // Build status message
    const duration = Date.now() - session.createdAt.getTime();
    const durationStr = this.formatDuration(duration);
    const messageCount = session.conversationHistory.length;
    const workflowCount = session.workflows.length;

    let statusMsg = `Session Status\n\n`;
    statusMsg += `Session ID: ${session.sessionId}\n`;
    statusMsg += `Status: ${session.status}\n`;
    statusMsg += `Duration: ${durationStr}\n`;
    statusMsg += `Messages: ${messageCount}\n`;
    statusMsg += `Workflows: ${workflowCount}\n`;

    if (workflowCount > 0) {
      statusMsg += `\nRecent Workflows:\n`;
      session.workflows.slice(-3).forEach(wf => {
        statusMsg += `• ${wf.workflowType}`;
        if (wf.ticker) statusMsg += ` (${wf.ticker})`;
        statusMsg += wf.completedAt ? ' ✓' : ' (in progress)';
        statusMsg += '\n';
      });
    }

    statusMsg += `\nUse /new to start fresh or continue chatting!`;

    await ctx.reply(statusMsg);

  } catch (error) {
    this.logger.error(`[${chatId}] Error getting status:`, error);
    await ctx.reply(BotMessages.SESSION_STATUS_FAILED);
  }
}
```

**Testing Considerations**:
- [ ] Test /analyze creates session if none exists
- [ ] Test /analyze uses existing session
- [ ] Test workflow execution is tracked
- [ ] Test /status shows accurate session info
- [ ] Test /status shows workflow history

---

### 4.5 Update Stream Manager

**Files**:
- `libs/bot/telegram/src/lib/stream-manager.service.ts`

**Add import for centralized messages and session orchestrator**:

```typescript
// libs/bot/telegram/src/lib/stream-manager.service.ts
import { BotMessages } from '@stock-analyzer/bot/common';
import { SessionOrchestrator } from '@stock-analyzer/bot/sessions';

export class StreamManagerService {

  constructor(
    private configService: ConfigService,
    private sessionOrchestrator: SessionOrchestrator  // NEW: Inject session orchestrator
  ) {}

  // NEW: High-level method - bot calls this (business logic only)
  async executeWorkflow(
    chatId: string,
    workflowType: WorkflowType,
    ticker: string,
    ctx: Context
  ): Promise<void> {
    // 1. Get or create session
    const session = this.sessionOrchestrator.getOrCreateSession(chatId);
    const sessionId = session.sessionId;

    // 2. Track workflow execution
    const workflowId = this.sessionOrchestrator.trackWorkflow(
      chatId,
      workflowType,
      ticker
    );

    // 3. Mark as responding
    this.startResponding(chatId);

    // 4. Start workflow stream (internal method)
    await this.startWorkflowStream(
      workflowType,
      sessionId,
      ticker,
      ctx,
      workflowId
    );
  }

  // INTERNAL: Low-level method - handles SSE stream
  private async startWorkflowStream(
    workflowType: WorkflowType,
    sessionId: string,
    ticker: string,
    ctx: Context,
    workflowId: string
  ): Promise<void> {
    const agentUrl = this.configService.get('AGENT_SERVICE_URL');
    const url = `${agentUrl}/api/workflow`;
    const chatId = ctx.chat.id.toString();

    try {
      // Create EventSource for SSE stream
      const eventSource = new EventSource(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          workflowType,
          params: { ticker, userPrompt: 'Perform comprehensive stock analysis' },
        }),
      });

      this.activeStreams.set(chatId, eventSource);
      this.streamBuffer.set(chatId, '');

      // ... existing event handlers

      // On COMPLETE event, mark workflow as completed
      eventSource.addEventListener(StreamEventType.COMPLETE, async (event) => {
        const data = JSON.parse(event.data);

        // Mark workflow execution as completed
        this.sessionOrchestrator.completeWorkflow(
          chatId,
          workflowId,
          this.streamBuffer.get(chatId) || ''
        );

        // Stop responding
        this.stopResponding(chatId);

        // Session stays ACTIVE (don't complete session)
        this.closeStream(chatId);
      });

      eventSource.addEventListener(StreamEventType.ERROR, async (event) => {
        const data = JSON.parse(event.data);
        this.logger.error(`[${chatId}] Workflow error:`, data.message);

        // Stop responding on error
        this.stopResponding(chatId);

        await ctx.reply(BotMessages.ANALYSIS_FAILED(ticker));
        this.closeStream(chatId);
      });
    } catch (error) {
      this.logger.error(`[${chatId}] Failed to start workflow stream:`, error);
      this.stopResponding(chatId);
      throw error;  // Propagate to bot handler
    }
  }

  // NEW: High-level conversation method - bot calls this
  async executeConversation(
    chatId: string,
    userMessage: string,
    ctx: Context
  ): Promise<void> {
    // 1. Get or create session
    const session = this.sessionOrchestrator.getOrCreateSession(chatId);
    const sessionId = session.sessionId;
    const conversationHistory = session.conversationHistory;

    // 2. Add user message to history
    this.sessionOrchestrator.addMessage(chatId, MessageRole.USER, userMessage);

    // 3. Mark as responding
    this.startResponding(chatId);

    // 4. Start conversation stream (internal method)
    await this.startConversationStream(
      sessionId,
      chatId,
      userMessage,
      conversationHistory,
      ctx
    );
  }

  // INTERNAL: Low-level conversation stream method
  private async startConversationStream(
    sessionId: string,
    chatId: string,
    userMessage: string,
    conversationHistory: ConversationMessage[],
    ctx: Context
  ): Promise<void> {
    const agentUrl = this.configService.get('AGENT_SERVICE_URL');
    const url = `${agentUrl}/api/conversation`;

    try {
      // Create EventSource for SSE stream
      const eventSource = new EventSource(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userMessage,
          conversationHistory,
        }),
      });

      this.activeStreams.set(chatId, eventSource);
      this.streamBuffer.set(chatId, '');

      // Handle events (same as workflow)
      eventSource.addEventListener(StreamEventType.CONNECTED, (event) => {
        this.logger.log(`[${chatId}] Conversation stream connected`);
      });

      eventSource.addEventListener(StreamEventType.THINKING, async (event) => {
        await ctx.sendChatAction('typing');
      });

      eventSource.addEventListener(StreamEventType.CHUNK, async (event) => {
        const data = JSON.parse(event.data);
        await this.handleChunk(chatId, data.content, ctx);
      });

      eventSource.addEventListener(StreamEventType.TOOL, async (event) => {
        const data = JSON.parse(event.data);
        await this.handleToolUsage(chatId, data, ctx);
      });

      eventSource.addEventListener(StreamEventType.COMPACTION, async (event) => {
        // NEW: Handle context compaction
        await ctx.reply(BotMessages.CONTEXT_COMPACTED);
      });

      eventSource.addEventListener(StreamEventType.COMPLETE, async (event) => {
        const data = JSON.parse(event.data);
        const finalResponse = this.streamBuffer.get(chatId) || '';

        // Send final message
        await this.sendFinalMessage(chatId, finalResponse, ctx);

        // Add assistant message to conversation history
        this.sessionOrchestrator.addMessage(
          chatId,
          MessageRole.ASSISTANT,
          finalResponse
        );

        // Session stays ACTIVE (don't complete session)
        this.closeStream(chatId);
      });

      eventSource.addEventListener(StreamEventType.ERROR, async (event) => {
        const data = JSON.parse(event.data);
        this.logger.error(`[${chatId}] Conversation error:`, data.message);

        await ctx.reply(
          `Error: ${data.message}\n\n` +
          'Try /new to start fresh or /help for assistance.'
        );

        this.closeStream(chatId);
      });

    } catch (error) {
      this.logger.error(`[${chatId}] Failed to start conversation stream:`, error);
      await ctx.reply(BotMessages.CONVERSATION_FAILED);
    }
  }

  private closeStream(chatId: number): void {
    const eventSource = this.activeStreams.get(chatId);
    if (eventSource) {
      eventSource.close();
      this.activeStreams.delete(chatId);
    }
    this.streamBuffer.delete(chatId);
  }
}
```

**Key Changes**:
- **NEW: `executeWorkflow()` and `executeConversation()`** - High-level methods for bot
- **Bot simplification** - Bot only calls one method, service handles all details
- **Session management moved to service layer** - Bot doesn't touch SessionOrchestrator
- **Private stream methods** - `startWorkflowStream()` and `startConversationStream()` are internal
- Handles same event types as before (connected, thinking, chunk, tool, complete, error)
- NEW: Handles `compaction` event to notify user of context compression
- Session remains ACTIVE after workflow/conversation completes
- Tracks workflow execution and adds messages to conversation history automatically

**Design Rationale**:
- **Single Responsibility** - Bot handles UI/UX, StreamManager handles execution logic
- **Encapsulation** - Implementation details (session, tracking) hidden from bot
- **Maintainability** - Changes to tracking logic don't affect bot code
- **Testability** - Service layer can be tested independently

**Testing Considerations**:
- [ ] Test conversation stream establishment
- [ ] Test chunk streaming and message updates
- [ ] Test tool usage notifications
- [ ] Test compaction event handling
- [ ] Test error handling and recovery

---

## Phase 5: Testing & Migration

### 5.1 Unit Tests

**Session Model Tests** (`libs/bot/sessions/src/lib/session-store/session-orchestrator.service.spec.ts`):
- [ ] getOrCreateSession returns existing ACTIVE session
- [ ] getOrCreateSession creates new session when none exists
- [ ] getOrCreateSession creates new session when previous was STOPPED
- [ ] getSession returns null for STOPPED session
- [ ] stopSession changes status to STOPPED
- [ ] trackWorkflow adds workflow to session
- [ ] completeWorkflow marks workflow as complete
- [ ] addMessage adds message to conversation history

**Agent Service Tests** (`libs/agent/core/src/lib/agent.service.spec.ts`):
- [ ] executeConversation starts with empty history
- [ ] executeConversation builds context from history
- [ ] buildConversationContext truncates to last N messages
- [ ] executeConversation emits expected events
- [ ] executeConversation handles tool usage

**API Controller Tests** (`libs/agent/api/src/lib/agent.controller.spec.ts`):
- [ ] POST /api/conversation validates DTO
- [ ] POST /api/conversation returns SSE stream
- [ ] POST /api/conversation emits correct event types

**Telegram Bot Tests** (`libs/bot/telegram/src/lib/telegram-bot.service.spec.ts`):
- [ ] /new command stops current session
- [ ] /new command creates new session
- [ ] Text handler creates session if none exists
- [ ] Text handler uses existing session
- [ ] /analyze command tracks workflow execution
- [ ] /status command shows accurate session info

---

### 5.2 Integration Tests

**Session Persistence Tests** (`libs/e2e/session-persistence.spec.ts`):
- [ ] Session persists across multiple workflows
- [ ] Session persists across conversation and workflow
- [ ] Workflow execution tracking works correctly
- [ ] Session stops only on /new command

**Conversation Flow Tests** (`libs/e2e/conversation-flow.spec.ts`):
- [ ] User can ask question → get answer → ask follow-up
- [ ] User can run workflow → ask question about results
- [ ] User can mix workflows and conversations seamlessly
- [ ] Context is retained across multiple turns

**Stream Manager Tests** (`libs/e2e/stream-manager.spec.ts`):
- [ ] Conversation stream handles all event types
- [ ] Compaction event notifies user correctly
- [ ] Session remains ACTIVE after conversation
- [ ] Multiple conversations in same session work

---

### 5.3 Data Migration

**Migration Script** (`scripts/migrate-sessions.ts`):

```typescript
import { SessionStatus } from '@stock-analyzer/bot/sessions';

async function migrateSessions() {
  const sessions = await sessionRepository.findAll();

  for (const session of sessions) {
    // Convert COMPLETED → ACTIVE
    if (session.status === 'completed') {
      session.status = SessionStatus.ACTIVE;
    }

    // Delete EXPIRED sessions
    if (session.status === 'expired') {
      await sessionRepository.delete(session.sessionId);
      continue;
    }

    // Regenerate sessionId (remove ticker)
    if (session.sessionId.includes('-AAPL-') || session.sessionId.includes('-MSFT-')) {
      const oldId = session.sessionId;
      const parts = oldId.split('-');
      const chatId = parts[0];
      const timestamp = parts[parts.length - 1];
      session.sessionId = `${chatId}-${timestamp}`;
      console.log(`Migrated: ${oldId} → ${session.sessionId}`);
    }

    // Initialize workflows array
    if (!session.workflows) {
      session.workflows = [];
    }

    await sessionRepository.update(session);
  }

  console.log('Migration complete');
}
```

**Migration Steps**:
1. Backup existing session data
2. Run migration script to update session structure
3. Verify data integrity
4. Deploy new code
5. Monitor for issues

---

## Phase 6: Documentation & Deployment

### 6.1 Update CLAUDE.md

**Sections to Update**:

1. **Session Management & Conversation Mode** (lines 200-280):
   - Document new 2-state system (ACTIVE/STOPPED)
   - Remove COMPLETED/EXPIRED documentation
   - Document `/new` command
   - Update session lifecycle diagram

2. **Two Operating Modes** (lines 350-400):
   - Rename section to "Operating Modes"
   - Document conversation as default mode (not a workflow)
   - Update workflow execution documentation
   - Show examples of seamless mode mixing

3. **Session Manager Methods** (lines 230-270):
   - Document `getOrCreateSession()`
   - Remove `getActiveSession()` and `getCompletedSession()`
   - Document workflow tracking methods
   - Update method signatures

4. **Telegram Bot Integration** (lines 700-800):
   - Document smart routing behavior
   - Add `/new` command documentation
   - Update text handler description
   - Show conversation flow examples

**New Documentation Sections**:

```markdown
## Session Persistence Architecture

Sessions are **chat-scoped** and **persistent**, lasting indefinitely until explicitly reset:

### Session Lifecycle

```
User opens chat → Session created (ACTIVE)
  ↓
User: /analyze AAPL → Workflow executes (session stays ACTIVE)
  ↓
User: "What's the P/E?" → Conversation (session stays ACTIVE)
  ↓
User: /analyze MSFT → Workflow executes (session stays ACTIVE)
  ↓
User: /new → Session stopped (STOPPED), new session created (ACTIVE)
```

### Session States

- **ACTIVE**: Default state, all interactions work
- **STOPPED**: Manually ended via `/new`, requires new session

### Operating Modes

1. **Conversation Mode (Default)**:
   - Freeform questions and answers
   - Full tool access (fetch_company_data, calculate_dcf)
   - Context retained from previous messages
   - No explicit mode selection needed

2. **Workflow Mode (Commands)**:
   - Structured analysis via commands (e.g., `/analyze TICKER`)
   - Executes within existing session
   - Results available for follow-up questions
   - Session persists after workflow completes

Users can seamlessly mix both modes in a single session.
```

---

### 6.2 Update README.md

Add section on session management:

```markdown
## Session Management

Stock Analyzer uses **persistent sessions** for each chat:

- Sessions last indefinitely (no timeouts)
- All conversations and workflows share the same session
- Use `/new` to start fresh
- Use `/status` to see current session info

### Example Flow

```
/analyze AAPL           # Run workflow
What's the P/E ratio?   # Ask follow-up
/analyze MSFT           # Run another workflow
Compare AAPL and MSFT   # Compare both
/new                    # Start fresh
```
```

---

### 6.3 Deployment Checklist

**Pre-Deployment**:
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Data migration script tested on staging
- [ ] Documentation updated
- [ ] Changelog prepared

**Deployment Steps**:
1. [ ] Backup production database
2. [ ] Deploy agent service (backward compatible)
3. [ ] Run data migration script
4. [ ] Deploy telegram bot service
5. [ ] Monitor logs for errors
6. [ ] Test with real users
7. [ ] Roll back if issues detected

**Post-Deployment**:
- [ ] Monitor error rates
- [ ] Check session creation/usage metrics
- [ ] Verify conversation flows work
- [ ] Collect user feedback

---

## Rollback Plan

If critical issues are detected:

1. **Immediate**: Revert telegram bot service to previous version
2. **Database**: Restore from backup (if data corruption)
3. **Agent**: Revert agent service (if streaming issues)
4. **Communication**: Notify users via /help message

**Rollback Criteria**:
- Session creation failures > 5%
- Conversation routing failures > 10%
- Critical bugs affecting user experience

---

## Success Metrics

### Technical Metrics
- [ ] Session creation success rate > 99%
- [ ] Average conversation latency < 3s
- [ ] Stream error rate < 1%
- [ ] Context compaction trigger < 5% of conversations

### User Experience Metrics
- [ ] Users successfully mix workflows and conversations
- [ ] Reduced confusion about mode switching
- [ ] Increased engagement (messages per session)
- [ ] Positive feedback on persistent sessions

---

## Future Enhancements

1. **Smart Context Management**:
   - Automatic summarization of old messages
   - Intelligent context pruning based on relevance
   - User-controlled context reset (/clear command)

2. **Session Analytics**:
   - Dashboard showing session metrics
   - Conversation flow visualization
   - Tool usage patterns

3. **Multi-User Sessions**:
   - Shared sessions for teams
   - Collaborative analysis

4. **Session Export**:
   - Export conversation history as PDF
   - Export analysis results as CSV

---

## Appendix: File Checklist

### Files to Create
- [ ] `libs/agent/api/src/lib/dto/conversation.dto.ts` (ConversationRequestDto, ConversationMessageDto)
- [ ] `scripts/migrate-sessions.ts` (Database migration script)
- [ ] `docs/PERSISTENT_CHAT_SESSIONS_REFACTORING.md` (this file)

### Files to Rename
- [ ] `libs/agent/api/src/lib/analysis.controller.ts` → `agent.controller.ts` (Rename class: AnalysisController → AgentController)

### Files to Modify
- [ ] `libs/bot/sessions/src/lib/session-store/interfaces/session.interface.ts` (Rename AnalysisSession → ChatSession)
- [ ] `libs/bot/sessions/src/lib/session-store/session-orchestrator.service.ts` (Add getOrCreateSession, remove completeSession)
- [ ] `libs/shared/types/src/lib/enums.ts` (Remove WorkflowType.CONVERSATION)
- [ ] `libs/agent/core/src/lib/workflows/workflow-registry.ts` (Remove conversation workflow config)
- [ ] `libs/agent/core/src/lib/agent.service.ts` (Add executeConversation + processStreamMessages, refactor executeQuery)
- [ ] `libs/agent/api/src/lib/agent.controller.ts` (Add conversation endpoint, update @Controller to 'api')
- [ ] `libs/bot/telegram/src/lib/telegram-bot.service.ts` (Add /new command, update text handler)
- [ ] `libs/bot/telegram/src/lib/stream-manager.service.ts` (Add startConversation method)
- [ ] `CLAUDE.md` (Update session management documentation)
- [ ] `README.md` (Add session management section)

### Files to Delete
- [ ] Any conversation workflow configuration files
- [ ] Expired session cleanup cron jobs

---

**Last Updated**: 2025-10-13
**Status**: Ready for Implementation