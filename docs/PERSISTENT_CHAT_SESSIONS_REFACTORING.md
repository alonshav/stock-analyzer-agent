# Session-Persistent Conversation Architecture Refactoring

**Status**: Planning Phase
**Created**: 2025-10-13
**Goal**: Transform sessions from ticker-scoped, time-limited analysis contexts into chat-scoped, persistent conversation contexts

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

### 1.1 Update Session Interface

**Files**:
- `libs/bot/sessions/src/lib/session-store/interfaces/session.interface.ts`

**Changes**:

```typescript
// BEFORE
export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
  EXPIRED = 'expired',
}

export interface AnalysisSession {
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

// AFTER
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

export interface AnalysisSession {
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
- Remove `expiresAt` field entirely (no auto-expiration)
- Remove `ticker` field from session (not ticker-scoped)
- Add `workflows` array to track workflow executions within session
- Simplify `SessionStatus` to only ACTIVE and STOPPED
- `sessionId` format changes from `chat-ticker-timestamp` to `chat-timestamp`

**Testing Considerations**:
- [ ] Unit tests for session creation without ticker
- [ ] Verify sessionId format generation
- [ ] Test workflow execution tracking
- [ ] Ensure backward compatibility with existing session data (migration)

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
  getOrCreateSession(chatId: number): AnalysisSession

  // Get current session (returns null if STOPPED or doesn't exist)
  getSession(chatId: number): AnalysisSession | null

  // Manual stop only (sets status to STOPPED)
  stopSession(chatId: number, reason?: string): void

  // Track workflow execution within session
  addWorkflowExecution(
    chatId: number,
    workflowType: WorkflowType,
    ticker?: string
  ): string  // Returns workflowId

  completeWorkflowExecution(
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
getOrCreateSession(chatId: number): AnalysisSession {
  // 1. Check for existing ACTIVE session
  const existing = this.sessionRepository.findByChatId(chatId);
  if (existing && existing.status === SessionStatus.ACTIVE) {
    return existing;
  }

  // 2. Create new session if none exists or previous was STOPPED
  const sessionId = this.generateSessionId(chatId);  // chat123-1234567890
  const newSession: AnalysisSession = {
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

addWorkflowExecution(
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
- `libs/agent/core/src/lib/prompts/base-system-prompt.ts` (NEW)

**New Method**:

```typescript
// libs/agent/core/src/lib/agent.service.ts
export class AgentService {

  // Existing method - unchanged
  async executeWorkflow(
    workflowType: WorkflowType,
    sessionId: string,
    ticker: string,
    userPrompt?: string,
    options?: QueryOptions
  ): Promise<void> {
    // ... existing implementation
  }

  // NEW method for freeform conversation
  async executeConversation(
    sessionId: string,
    userMessage: string,
    conversationHistory: ConversationMessage[],
    options?: QueryOptions
  ): Promise<void> {
    this.logger.log(`[${sessionId}] Starting conversation`);

    // Emit connected event
    this.eventEmitter.emit(
      createEventName(StreamEventType.CONNECTED, sessionId),
      {
        sessionId,
        type: StreamEventType.CONNECTED,
        timestamp: new Date().toISOString(),
      }
    );

    // Build context from conversation history
    const contextMessages = this.buildConversationContext(conversationHistory);

    // Execute query with base system prompt (NOT workflow-specific)
    const stream = query({
      prompt: userMessage,
      systemPrompt: BASE_CONVERSATION_PROMPT,  // NEW: Base prompt for freeform chat
      conversationHistory: contextMessages,
      options: {
        model: this.configService.get('ANTHROPIC_MODEL'),
        maxTurns: 20,
        maxThinkingTokens: 10000,
        permissionMode: 'bypassPermissions',
        mcpServers: {
          'stock-analyzer': this.mcpServer,  // All tools available
        },
        ...options,
      },
    });

    // Process stream (same as workflow)
    await this.processStream(stream, sessionId);

    this.logger.log(`[${sessionId}] Conversation completed`);
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

**Base Conversation Prompt**:

```typescript
// libs/agent/core/src/lib/prompts/base-system-prompt.ts (NEW FILE)
export const BASE_CONVERSATION_PROMPT = `
You are a financial analysis assistant with access to real-time market data and valuation tools.

## Your Capabilities

1. **Answer financial questions**: Explain concepts, interpret data, provide insights
2. **Fetch company data**: Use fetch_company_data tool for real-time financial information
3. **Perform valuations**: Use calculate_dcf tool for DCF analysis
4. **Execute workflows**: Full stock analysis via structured workflows (when requested)

## Available Tools

- fetch_company_data: Get real-time financial data (income statements, balance sheets, ratios, etc.)
- calculate_dcf: Perform discounted cash flow valuation
- test_api_connection: Verify API connectivity

## Guidelines

- **Be conversational**: Respond naturally to user questions
- **Provide context**: Reference previous messages in the conversation
- **Use tools proactively**: Fetch data when needed to answer questions accurately
- **Explain your reasoning**: Show your work when performing analysis
- **Ask clarifying questions**: If user intent is unclear
- **Stay on topic**: Focus on financial analysis and market data

## Response Style

- Concise but thorough
- Use markdown formatting for clarity
- Include numbers and metrics when relevant
- Cite data sources (e.g., "According to latest 10-Q...")

Remember: You're having an ongoing conversation. Build on previous context and maintain continuity.
`;
```

**Implementation Notes**:
- Conversation mode has access to ALL tools (same as workflows)
- Uses extended thinking (`maxThinkingTokens: 10000`)
- Processes stream identically to workflows (same event emissions)
- No workflow lifecycle (no phases, no completion state)
- Context window management needed for long conversations

**Context Management Strategy**:
1. **Sliding window**: Keep last N messages (e.g., 10-20)
2. **Token-based truncation**: Keep messages within token budget
3. **Intelligent compaction**: Summarize older messages when context grows
4. **Emit compaction event**: Notify user when context is compacted

**Testing Considerations**:
- [ ] Unit test: executeConversation with empty history
- [ ] Unit test: executeConversation with conversation history
- [ ] Unit test: buildConversationContext truncation
- [ ] Integration test: Conversation with tool usage
- [ ] Integration test: Multi-turn conversation with context retention

---

## Phase 3: API Layer (Endpoints)

### 3.1 Add Conversation Endpoint

**Files**:
- `libs/agent/api/src/lib/agent.controller.ts`
- `libs/agent/api/src/lib/dto/conversation.dto.ts` (NEW)

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

**New Endpoint**:

```typescript
// libs/agent/api/src/lib/agent.controller.ts
@Controller('api')
export class AgentController {

  // Existing workflow endpoint
  @Post('analyze')
  @Sse()
  async executeWorkflow(@Body() dto: WorkflowRequestDto): Promise<Observable<MessageEvent>> {
    // ... existing implementation
  }

  // NEW: Conversation endpoint
  @Post('conversation')
  @Sse()
  async executeConversation(
    @Body() dto: ConversationRequestDto
  ): Promise<Observable<MessageEvent>> {
    const { sessionId, userMessage, conversationHistory } = dto;

    // Validate session exists and is ACTIVE
    // (Handled by caller - Telegram bot)

    // Start conversation execution
    this.agentService.executeConversation(
      sessionId,
      userMessage,
      conversationHistory
    );

    // Return SSE stream (same pattern as workflow)
    return new Observable<MessageEvent>((subscriber) => {
      const eventHandlers = this.createEventHandlers(sessionId, subscriber);

      // Subscribe to events
      this.eventEmitter.on(`analysis.connected.${sessionId}`, eventHandlers.onConnected);
      this.eventEmitter.on(`analysis.chunk.${sessionId}`, eventHandlers.onChunk);
      this.eventEmitter.on(`analysis.thinking.${sessionId}`, eventHandlers.onThinking);
      this.eventEmitter.on(`analysis.tool.${sessionId}`, eventHandlers.onTool);
      this.eventEmitter.on(`analysis.complete.${sessionId}`, eventHandlers.onComplete);
      this.eventEmitter.on(`analysis.error.${sessionId}`, eventHandlers.onError);

      // Cleanup on disconnect
      return () => {
        this.eventEmitter.removeListener(`analysis.connected.${sessionId}`, eventHandlers.onConnected);
        // ... remove all listeners
      };
    });
  }
}
```

**Implementation Notes**:
- Conversation endpoint returns SSE stream (identical format to workflow endpoint)
- Same event types: connected, chunk, thinking, tool, complete, error
- No PDF generation in conversation mode (unless explicitly requested via tool)
- Validation happens at Telegram bot layer (session existence check)

**Testing Considerations**:
- [ ] Unit test: DTO validation
- [ ] Integration test: POST /api/conversation returns SSE stream
- [ ] Integration test: Conversation with tool usage
- [ ] E2E test: Full conversation flow from bot to agent

---

## Phase 4: Telegram Bot (User Interface)

### 4.1 Add /new Command

**Files**:
- `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**New Command Handler**:

```typescript
// libs/bot/telegram/src/lib/telegram-bot.service.ts
export class TelegramBotService {

  @Command('new')
  async handleNewCommand(@Ctx() ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
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

      await ctx.reply(
        'Started a new conversation session.\n\n' +
        'You can:\n' +
        '• Ask me any financial questions\n' +
        '• Use /analyze TICKER for full stock analysis\n' +
        '• Use /status to see current session info\n' +
        '• Use /help for more commands'
      );
    } catch (error) {
      this.logger.error(`[${chatId}] Error starting new session:`, error);
      await ctx.reply('Failed to start new session. Please try again.');
    }
  }

  @Command('reset')
  async handleResetCommand(@Ctx() ctx: Context): Promise<void> {
    // Alias for /new command
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

### 4.2 Update Text Handler (Default to Conversation)

**Files**:
- `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Updated Handler**:

```typescript
// libs/bot/telegram/src/lib/telegram-bot.service.ts
@On('text')
async handleText(@Ctx() ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const text = (ctx.message as any)?.text;

  if (!chatId || !text || text.startsWith('/')) {
    return; // Ignore commands (handled separately)
  }

  try {
    // STEP 1: Get or create session (always have a session)
    const session = this.sessionOrchestrator.getOrCreateSession(chatId);
    const sessionId = session.sessionId;

    this.logger.log(`[${chatId}] Processing text in session: ${sessionId}`);

    // STEP 2: Add user message to conversation history
    this.sessionOrchestrator.addMessage(
      chatId,
      MessageRole.USER,
      text
    );

    // STEP 3: Route to conversation mode (default behavior)
    await this.startConversation(ctx, sessionId, text, session.conversationHistory);

  } catch (error) {
    this.logger.error(`[${chatId}] Error handling text:`, error);
    await ctx.reply(
      'Sorry, something went wrong. Try:\n' +
      '• /new to start fresh\n' +
      '• /status to check session\n' +
      '• /help for assistance'
    );
  }
}

private async startConversation(
  ctx: Context,
  sessionId: string,
  userMessage: string,
  conversationHistory: ConversationMessage[]
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Show typing indicator
  await ctx.sendChatAction('typing');

  // Start conversation stream via stream manager
  await this.streamManager.startConversation(
    sessionId,
    chatId,
    userMessage,
    conversationHistory,
    ctx
  );
}
```

**Key Changes**:
- `getOrCreateSession()` ensures session always exists
- All non-command text routes to conversation mode by default
- No explicit workflow detection needed (user uses commands for workflows)
- Simplified routing logic (no mode switching)

**Implementation Notes**:
- Typing indicator shows while processing
- Conversation history is passed to agent for context
- Session persists across all interactions
- No conflict detection needed (session is chat-scoped, not ticker-scoped)

**Testing Considerations**:
- [ ] Test text input creates session if none exists
- [ ] Test text input uses existing session
- [ ] Test message is added to conversation history
- [ ] Test conversation stream is started

---

### 4.3 Update Workflow Commands

**Files**:
- `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Updated /analyze Command**:

```typescript
@Command('analyze')
async handleAnalyzeCommand(@Ctx() ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const text = (ctx.message as any)?.text;

  if (!chatId) return;

  // Parse ticker from command
  const match = text?.match(/^\/analyze\s+([A-Z]{1,5})$/i);
  if (!match) {
    await ctx.reply(
      'Usage: /analyze TICKER\n' +
      'Example: /analyze AAPL'
    );
    return;
  }

  const ticker = match[1].toUpperCase();

  try {
    // STEP 1: Get or create session (workflow executes within session)
    const session = this.sessionOrchestrator.getOrCreateSession(chatId);
    const sessionId = session.sessionId;

    this.logger.log(`[${chatId}] Starting workflow for ${ticker} in session: ${sessionId}`);

    // STEP 2: Track workflow execution
    const workflowId = this.sessionOrchestrator.addWorkflowExecution(
      chatId,
      WorkflowType.STOCK_ANALYSIS,
      ticker
    );

    // STEP 3: Start workflow stream
    await this.streamManager.startWorkflow(
      WorkflowType.STOCK_ANALYSIS,
      sessionId,
      ticker,
      ctx,
      workflowId  // Pass workflowId for tracking
    );

    // Note: Workflow completion updates workflowExecution.completedAt
    // Session remains ACTIVE after workflow completes

  } catch (error) {
    this.logger.error(`[${chatId}] Error starting workflow:`, error);
    await ctx.reply(`Failed to start analysis for ${ticker}. Please try again.`);
  }
}
```

**Key Changes**:
- Uses `getOrCreateSession()` instead of creating ticker-specific session
- Tracks workflow execution via `addWorkflowExecution()`
- Session persists after workflow completes (no status change)
- Workflow is an event within the session, not a state transition

**Updated /status Command**:

```typescript
@Command('status')
async handleStatusCommand(@Ctx() ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const session = this.sessionOrchestrator.getSession(chatId);

    if (!session) {
      await ctx.reply(
        'No active session.\n\n' +
        'Use /new to start a conversation or /analyze TICKER for stock analysis.'
      );
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
    await ctx.reply('Failed to get session status.');
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

### 4.4 Update Stream Manager

**Files**:
- `libs/bot/telegram/src/lib/stream-manager.service.ts`

**New Conversation Stream Method**:

```typescript
export class StreamManagerService {

  // Existing workflow stream method - mostly unchanged
  async startWorkflow(
    workflowType: WorkflowType,
    sessionId: string,
    ticker: string,
    ctx: Context,
    workflowId?: string  // NEW: Optional workflowId for tracking
  ): Promise<void> {
    // ... existing implementation

    // On COMPLETE event, mark workflow as completed
    eventSource.addEventListener(StreamEventType.COMPLETE, (event) => {
      const data = JSON.parse(event.data);

      if (workflowId) {
        // Mark workflow execution as completed
        this.sessionOrchestrator.completeWorkflowExecution(
          ctx.chat.id,
          workflowId,
          this.streamBuffer.get(chatId) || ''
        );
      }

      // Session stays ACTIVE (don't complete session)
      this.closeStream(chatId);
    });
  }

  // NEW: Conversation stream method
  async startConversation(
    sessionId: string,
    chatId: number,
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
        await ctx.reply(
          'Context has grown large and was compacted to maintain performance.\n\n' +
          'You can continue chatting, or use /new to start completely fresh.'
        );
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
      await ctx.reply('Failed to start conversation. Please try again.');
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
- New `startConversation()` method calls `/api/conversation` endpoint
- Handles same event types as workflow (connected, thinking, chunk, tool, complete, error)
- NEW: Handles `compaction` event to notify user of context compression
- No PDF generation in conversation mode (unless tool explicitly called)
- Session remains ACTIVE after conversation completes
- Adds assistant message to conversation history

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
- [ ] addWorkflowExecution adds workflow to session
- [ ] completeWorkflowExecution marks workflow as complete
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
- [ ] `libs/agent/core/src/lib/prompts/base-system-prompt.ts`
- [ ] `libs/agent/api/src/lib/dto/conversation.dto.ts`
- [ ] `scripts/migrate-sessions.ts`
- [ ] `docs/SESSION_PERSISTENT_CONVERSATION_REFACTORING.md` (this file)

### Files to Modify
- [ ] `libs/bot/sessions/src/lib/session-store/interfaces/session.interface.ts`
- [ ] `libs/bot/sessions/src/lib/session-store/session-orchestrator.service.ts`
- [ ] `libs/shared/types/src/lib/enums.ts`
- [ ] `libs/agent/core/src/lib/workflows/workflow-registry.ts`
- [ ] `libs/agent/core/src/lib/agent.service.ts`
- [ ] `libs/agent/api/src/lib/agent.controller.ts`
- [ ] `libs/bot/telegram/src/lib/telegram-bot.service.ts`
- [ ] `libs/bot/telegram/src/lib/stream-manager.service.ts`
- [ ] `CLAUDE.md`
- [ ] `README.md`

### Files to Delete
- [ ] Any conversation workflow configuration files
- [ ] Expired session cleanup cron jobs

---

**Last Updated**: 2025-10-13
**Status**: Ready for Implementation