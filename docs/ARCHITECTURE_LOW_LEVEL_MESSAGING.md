# Architecture: Low-Level Messaging Pattern

## Overview

This document describes the **centralized low-level messaging pattern** implemented via `BotMessagingService` - a critical architectural component ensuring complete conversation history tracking.

## The Problem

**Original Issue:** Workflow analysis results were not being added to conversation history, causing the bot to have no memory of previous analyses.

**User's Original Feedback:**
> "The addition, the adding of messages to the session should be somewhere very like low level basic that ensures all messages are added to the conversation history and no context is removed... We need to do it at a very like low level location that ensures that all the messages are added automatically to the session, whether this is a workflow, whether this is a conversation, doesn't matter. !IMPORTANT NOTE!"

## The Solution: BotMessagingService

### Architecture Pattern

**BotMessagingService** is a LOW-LEVEL service that acts as the SINGLE POINT OF CONTROL for all bot messaging:

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

### Key Principle

**EVERY message sent by the bot MUST go through BotMessagingService.**

This ensures:
1. ✅ Message is sent to Telegram
2. ✅ Message is automatically tracked in conversation history
3. ✅ NO message is ever lost from context
4. ✅ Uniform behavior across workflows and conversations

## Implementation

### Core Methods

**Location:** `libs/bot/telegram/src/lib/bot-messaging.service.ts`

```typescript
@Injectable()
export class BotMessagingService {
  constructor(private readonly sessionOrchestrator: SessionOrchestrator) {}

  /**
   * Send assistant message to Telegram AND track in conversation history
   * This is the LOW-LEVEL method that ALL bot responses should use.
   */
  async sendAndTrack(
    ctx: Context,
    chatId: string,
    message: string,
    options?: { parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2' }
  ): Promise<void> {
    // 1. Send to Telegram
    await ctx.reply(message, options);

    // 2. Add to conversation history
    this.sessionOrchestrator.addMessage(
      chatId,
      MessageRole.ASSISTANT,
      message
    );
  }

  /**
   * Track user message in conversation history
   * Use this when the bot receives a message from the user
   */
  async trackUserMessage(chatId: string, message: string): Promise<void> {
    this.sessionOrchestrator.addMessage(chatId, MessageRole.USER, message);
  }

  /**
   * Send document and track notification in conversation history
   */
  async sendDocumentAndTrack(
    ctx: Context,
    chatId: string,
    buffer: Buffer,
    filename: string,
    caption: string
  ): Promise<void> {
    await ctx.telegram.sendDocument(chatIdNum, {...}, { caption });
    this.trackAssistantMessage(chatId, caption);
  }

  /**
   * Track assistant message in conversation history without sending
   * Use for messages already sent (e.g., streaming results)
   */
  trackAssistantMessage(chatId: string, message: string): void {
    this.sessionOrchestrator.addMessage(
      chatId,
      MessageRole.ASSISTANT,
      message
    );
  }

  /**
   * Send typing action (does NOT track in conversation history)
   */
  async sendTypingAction(ctx: Context): Promise<void> {
    await ctx.sendChatAction('typing');
  }
}
```

## Usage Patterns

### Pattern 1: Regular Messages

**Before:**
```typescript
await ctx.reply('Analysis complete!');
// ❌ Message sent but NOT tracked in history
```

**After:**
```typescript
await this.botMessaging.sendAndTrack(ctx, chatId, 'Analysis complete!');
// ✅ Message sent AND tracked automatically
```

### Pattern 2: Streaming Content

**Before:**
```typescript
client.on(StreamEventType.COMPLETE, async () => {
  const finalResponse = this.streamBuffers.get(chatId) || '';

  // Text already sent via CHUNK events
  this.sessionOrchestrator.addMessage(chatId, MessageRole.ASSISTANT, finalResponse);
  // ❌ Direct call bypasses low-level service
});
```

**After:**
```typescript
client.on(StreamEventType.COMPLETE, async () => {
  const finalResponse = this.streamBuffers.get(chatId) || '';

  // Text already sent via CHUNK events, just tracking final result
  this.botMessaging.trackAssistantMessage(chatId, finalResponse);
  // ✅ Goes through low-level service
});
```

### Pattern 3: Documents (PDFs, Images)

**Before:**
```typescript
await ctx.telegram.sendDocument(chatIdNum, {...}, { caption });
this.sessionOrchestrator.addMessage(chatId, MessageRole.ASSISTANT, caption);
// ❌ Two separate calls, can forget history tracking
```

**After:**
```typescript
await this.botMessaging.sendDocumentAndTrack(
  ctx,
  chatId,
  pdfBuffer,
  filename,
  caption
);
// ✅ Single method handles both sending and tracking
```

### Pattern 4: User Messages

**Before:**
```typescript
this.sessionOrchestrator.addMessage(chatId, MessageRole.USER, userMessage);
// ❌ Direct call bypasses low-level service
```

**After:**
```typescript
this.botMessaging.trackUserMessage(chatId, userMessage);
// ✅ Goes through low-level service
```

## Migration Checklist

All bot message sending has been migrated to use BotMessagingService:

### ✅ StreamManagerService

**Workflow Event Handlers:**
- [x] THINKING event → `sendAndTrack()`
- [x] TOOL event → `sendAndTrack()`
- [x] TOOL_RESULT event → `sendAndTrack()`
- [x] PDF event → `sendDocumentAndTrack()`
- [x] COMPLETE event → `sendAndTrack()`
- [x] ERROR event → `sendAndTrack()`
- [x] Connection error → `sendAndTrack()`

**Conversation Event Handlers:**
- [x] TOOL event → `sendAndTrack()`
- [x] TOOL_RESULT event → `sendAndTrack()`
- [x] COMPACTION event → `sendAndTrack()`
- [x] COMPLETE event → `trackAssistantMessage()` (streaming)
- [x] ERROR event → `sendAndTrack()`
- [x] Connection error → `sendAndTrack()`

**High-Level Methods:**
- [x] executeWorkflow() → `trackUserMessage()` for initial request
- [x] executeConversation() → `trackUserMessage()` for user input

### ✅ TelegramBotService

**Command Handlers:**
- [x] handleAnalyzeCommand() → `sendAndTrack()`
- [x] handleStopCommand() → `sendAndTrack()`
- [x] handleNewCommand() → `sendAndTrack()`
- [x] handleTextMessage() → `sendAndTrack()`
- [x] handleStatusCommand() → `sendAndTrack()`
- [x] handleStartCommand() → `sendAndTrack()`
- [x] handleHelpCommand() → `sendAndTrack()`

## Benefits

### 1. Complete Context
Every message is tracked automatically - no manual `addMessage()` calls scattered throughout the codebase.

### 2. Consistency
Uniform behavior for:
- Workflow messages
- Conversation messages
- Error messages
- Status messages
- Command responses

### 3. Maintainability
Single point of change if messaging logic needs to be modified (e.g., add logging, add metrics, add filtering).

### 4. Reliability
Impossible to forget tracking - the low-level service handles it automatically.

### 5. Debugging
Easy to debug conversation history issues - all messages flow through one service.

## Testing Strategy

### Unit Tests

Test BotMessagingService in isolation:

```typescript
describe('BotMessagingService', () => {
  it('should send message and track in history', async () => {
    await service.sendAndTrack(ctx, '123', 'Hello');

    expect(ctx.reply).toHaveBeenCalledWith('Hello', undefined);
    expect(sessionOrchestrator.addMessage).toHaveBeenCalledWith(
      '123',
      MessageRole.ASSISTANT,
      'Hello'
    );
  });
});
```

### Integration Tests

Verify message flow through entire stack:

```typescript
describe('Workflow Integration', () => {
  it('should track all workflow messages in conversation history', async () => {
    await streamManager.executeWorkflow('123', WorkflowType.FULL_ANALYSIS, 'AAPL', ctx, agentUrl);

    // Simulate events
    await triggerThinkingEvent();
    await triggerToolEvent();
    await triggerCompleteEvent();

    const session = sessionOrchestrator.getSession('123');
    expect(session.conversationHistory).toContain(/* thinking message */);
    expect(session.conversationHistory).toContain(/* tool message */);
    expect(session.conversationHistory).toContain(/* analysis result */);
  });
});
```

## Architectural Principles

### 1. Low-Level Service Pattern

BotMessagingService is a **low-level** service - it sits below all other bot logic and provides a primitive operation: "send message and track".

### 2. Single Responsibility

The service has ONE job: ensure every message is sent AND tracked. It doesn't handle:
- Business logic
- Workflow orchestration
- Session management (uses SessionOrchestrator)
- Message formatting (uses formatters)

### 3. Dependency Direction

```
TelegramBotService  →  StreamManagerService  →  BotMessagingService  →  SessionOrchestrator
     (High)                 (Mid)                    (Low)                  (Storage)
```

Higher-level services depend on lower-level services. BotMessagingService depends only on SessionOrchestrator.

### 4. No Bypass Rule

**NEVER call `ctx.reply()` or `sessionOrchestrator.addMessage()` directly.**

Always use BotMessagingService methods. The only exception is error handling in BotMessagingService itself.

## Related Documentation

- `docs/BUGFIX_CONVERSATION_HISTORY.md` - Original bug fix that led to this architecture
- `docs/PERSISTENT_CHAT_SESSIONS_REFACTORING.md` - Session management refactoring
- `docs/TELEGRAM_FORMATTING_GUIDE.md` - Message formatting guidelines
- `CLAUDE.md` - Overall project architecture

## Migration Notes

This architecture was implemented in response to user feedback:

**Initial Fix (Partial):**
1. Added conversation history tracking in workflow COMPLETE handler
2. Moved logic to SessionOrchestrator.completeWorkflow()
3. Added tracking for THINKING, TOOL, TOOL_RESULT events

**Final Fix (Complete):**
1. Created BotMessagingService as centralized low-level service
2. Migrated ALL message sending to use BotMessagingService
3. Ensured uniform behavior across workflows and conversations
4. Eliminated possibility of forgetting to track messages

## Verification

To verify all messages are tracked:

1. Start fresh session with `/new`
2. Run `/analyze AAPL`
3. Wait for analysis completion
4. Ask follow-up question: "What's the P/E ratio?"
5. Run `/status` to view conversation history

Expected `/status` output should show:
- Initial workflow request
- Thinking messages
- Tool call messages
- Analysis result
- Follow-up question
- Follow-up answer

**Every single message should appear in conversation history.**
