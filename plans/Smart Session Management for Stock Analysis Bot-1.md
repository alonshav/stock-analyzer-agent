# Smart Session Management for Stock Analysis Bot

## Complete Implementation Guide

---

## Understanding Sessions

### What is a session?

A **session** is like a conversation about ONE specific stock. When you analyze AAPL, that creates an AAPL session. All follow-up questions about AAPL stay within that session.

### Why do we need sessions?

**Without sessions:**
- Bot forgets what stock you're talking about
- Can't have back-and-forth conversations
- Can't compare multiple stocks

**With sessions:**
- Bot remembers the context of your AAPL analysis
- You can ask follow-up questions naturally
- Bot can compare AAPL vs MSFT if you analyzed both

### How it works

```
/analyze AAPL          → Creates AAPL session (ACTIVE)
"What's the P/E?"      → Answers within AAPL session
/analyze MSFT          → Asks: "Switch from AAPL to MSFT?"
"Compare to Apple"     → Bot has both sessions in memory
```

### Session States

- **ACTIVE**: Currently analyzing or discussing this stock
- **COMPLETED**: Analysis done, can still reference it
- **STOPPED**: User manually stopped it
- **EXPIRED**: Timeout (1 hour of inactivity)

---

## Part 1: The Session Manager Service

This is the "brain" that remembers all sessions and manages their lifecycle.

### Key Responsibilities

1. Create new sessions when user runs `/analyze`
2. Track which session is currently active per chat
3. Keep last 3-5 sessions for comparisons
4. Clean up expired sessions automatically
5. Build context from session history

### Session Data Structure

```typescript
interface AnalysisSession {
  sessionId: string;           // Unique ID: "AAPL-1234567890"
  ticker: string;              // Stock ticker: "AAPL"
  chatId: string;              // Telegram chat ID
  status: 'active' | 'completed' | 'stopped';

  // Timestamps
  startedAt: Date;             // When analysis started
  lastActivity: Date;          // Last time user interacted
  expiresAt: Date;             // When session expires (1 hour)

  // Analysis results (saved when analysis completes)
  fullAnalysis?: string;       // Complete analysis text
  executiveSummary?: string;   // Executive summary

  // Conversation history (all Q&A in this session)
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}
```

### Key Methods

#### `getActiveSession(chatId: string)`

**Purpose:** Get the session user is currently working with

**Example:**
- User analyzed AAPL 10 minutes ago → Returns AAPL session
- User hasn't analyzed anything → Returns null
- Session expired → Returns null

---

#### `getRecentSessions(chatId: string, limit = 5)`

**Purpose:** Get last few sessions for comparison

**Why:** When user asks "Compare to Apple", we need access to the AAPL session even if MSFT is currently active

**Example:** Returns: `[MSFT-session, AAPL-session, NVDA-session]`

---

#### `createSession(chatId: string, ticker: string)`

**Purpose:** Start a new analysis session

**Called when:** User runs `/analyze AAPL`

**What it does:**
1. Creates new session object
2. Adds to session list
3. Marks as active
4. Starts 1-hour expiration timer

---

#### `addMessage(chatId: string, role: string, content: string)`

**Purpose:** Save a conversation message to the active session

**Called when:**
- User asks: "What's the P/E ratio?"
- Bot answers: "The P/E ratio is 28.5..."

**Why:** We need to remember this conversation for context in future questions

---

#### `completeSession(chatId: string, fullAnalysis: string, executiveSummary: string)`

**Purpose:** Save analysis results when analysis finishes

**Called when:** Agent completes the 2-phase analysis

**Note:** Session stays active for continued conversation

---

#### `stopSession(chatId: string)`

**Purpose:** Manually stop the active session

**Called when:** User runs `/stop` command

---

#### `buildContextPrompt(chatId: string, newMessage: string)`

**Purpose:** Build a prompt that includes relevant context from sessions

**Why:** When user asks "What's the P/E?", Claude needs to know:
1. Which stock we're talking about (AAPL)
2. What we already discussed ("Is it a good buy?")
3. What other stocks we analyzed recently (for comparisons)

**Example output:**

```
Recent analysis sessions (for reference):

--- AAPL Analysis ---
Apple Inc shows strong fundamentals with revenue of $394B...

--- MSFT Analysis ---
Microsoft Corporation demonstrates solid growth...

Current conversation about AAPL:

user: What's the revenue growth?
assistant: Apple's revenue grew 8% YoY to $394B...
user: What's the P/E ratio?
```

---

## Part 2: Agent Service Updates

The Agent now has **TWO modes:**

### 1. WORKFLOW MODE - `analyzeStock()`

**Triggered by:** `/analyze` command

**What it does:**
1. Create new session
2. Run Phase 1: Full analysis (with streaming)
3. Run Phase 2: Executive summary (no streaming)
4. Save results to session
5. Emit completion event

**Key Steps:**
- Creates new session via Session Manager
- Runs 2-phase analysis
- Saves results to session
- Keeps session active for follow-ups

---

### 2. CONVERSATION MODE - `handleConversation()`

**Triggered by:** Regular messages (not commands)

**Example:** User asks "What's the P/E ratio?"

**What it does:**
1. Build context from active session + recent sessions
2. Send to Claude with context
3. Get response
4. Save Q&A to session history

**Key Feature:** Uses `buildContextPrompt()` to include:
- Recent session summaries (for comparisons)
- Active session conversation history
- Current question

---

## Part 3: Telegram Bot with Smart Routing

The bot intelligently routes messages to the right handler.

### Command: `/analyze TICKER`

**Smart behavior:**
- If no active session → Start immediately
- If active session for different stock → Show confirmation
- If active session for same stock → Just continue

**Confirmation Dialog:**

When trying to analyze a different stock while one is active:

```
⚠️ You have an active analysis for AAPL.

Start new analysis for MSFT?

[✋ Cancel] [🔄 Stop & Analyze]
```

---

### Handler: Regular Text Messages

**Smart routing:**

1. **If looks like ticker** (AAPL) → Treat as `/analyze` command
2. **If active session exists** → Conversation mode
3. **If no active session** → Show help

**Example:**

```
User: AAPL
Bot: [Treats as /analyze AAPL]

User: What's the P/E?
Bot: [Answers within AAPL session]

User: Hello
Bot: 💡 No active analysis session.
     To analyze: /analyze AAPL
```

---

### Command: `/stop`

**What it does:** Manually stop the active analysis session

**Response:**
```
✅ Stopped analysis for AAPL.
```

---

### Command: `/status`

**What it does:** Show active session and recent sessions

**Response:**
```
📊 Active session: AAPL
⏰ Expires in: 45 minutes
💬 Messages: 12

📚 Recent sessions:
🟢 AAPL (active)
⚪ MSFT (completed)
⚪ NVDA (completed)
```

---

## Usage Examples

### Example 1: Basic Analysis Flow

```
User: /analyze AAPL
Bot:  🔍 Starting analysis for AAPL...
      [streams analysis results]
      ✅ Analysis complete

User: What's the P/E ratio?
Bot:  Based on the AAPL analysis, the P/E ratio is 28.5.
      For a company with Apple's growth profile, this is reasonable...

User: Is that good?
Bot:  Compared to the tech sector average P/E of 25...
```

---

### Example 2: Session Conflict Handling

```
User: /analyze AAPL
Bot:  [completes analysis]

User: What do you think?
Bot:  AAPL shows strong fundamentals...

User: /analyze MSFT
Bot:  ⚠️ You have an active analysis for AAPL.
      Start new analysis for MSFT?
      [✋ Cancel] [🔄 Stop & Analyze]

User: [clicks Stop & Analyze]
Bot:  ✅ Starting new analysis for MSFT...
      [streams MSFT analysis]
```

---

### Example 3: Cross-Session Comparison

```
User: /analyze AAPL
Bot:  [completes analysis]

User: /analyze MSFT
Bot:  [confirmation → user accepts]
      [completes MSFT analysis]

User: How does Microsoft compare to Apple?
Bot:  Based on the recent analyses:
      
      Revenue Growth:
      • AAPL: 8% YoY
      • MSFT: 12% YoY
      
      Profit Margins:
      • AAPL: 28%
      • MSFT: 25%
      
      Cloud Business:
      • AAPL: Services growing steadily
      • MSFT: Azure leading growth
```

---

### Example 4: Session Timeout

```
User: /analyze AAPL
Bot:  [completes analysis]

[60 minutes pass]

User: What about the revenue?
Bot:  💡 No active analysis session.
      
      To analyze a stock:
      • /analyze AAPL
      • Or just send: AAPL
```

---

### Example 5: Implicit Ticker Recognition

```
User: NVDA
Bot:  🔍 Starting analysis for NVDA...
      [treats it like /analyze NVDA]
```

---

## Configuration

### Session Settings

```typescript
const CONFIG = {
  SESSION_TIMEOUT: 60 * 60 * 1000,  // 1 hour
  MAX_SESSIONS_PER_CHAT: 5,         // Keep last 5
  CLEANUP_INTERVAL: 5 * 60 * 1000,  // Clean up every 5 min
};
```

### Module Setup

**agent.module.ts:**
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ApiModule,
  ],
  providers: [
    AgentService,
    StreamService,
    SessionManagerService, // ← Add this
  ],
  exports: [
    AgentService,
    StreamService,
    SessionManagerService, // ← Add this
  ],
})
export class AppModule {}
```

**telegram-bot.module.ts:**
```typescript
@Module({
  imports: [
    ConfigModule,
    AgentModule, // ← Import to get SessionManager
  ],
  controllers: [TelegramBotController],
  providers: [
    TelegramBotService,
    StreamManagerService,
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
```

---

## Key Features Summary

✅ **Smart routing**: `/analyze` = workflow, everything else = conversation

✅ **Session scoping**: Conversations tied to active analysis

✅ **Conflict handling**: Confirmation dialog before starting new analysis

✅ **Multi-session memory**: Keep last 5 sessions for comparisons

✅ **Auto-expiration**: 1 hour timeout with activity refresh

✅ **Manual control**: `/stop` command to end session early

✅ **Status visibility**: `/status` shows active + recent sessions

✅ **Implicit commands**: Just send "AAPL" instead of "/analyze AAPL"

✅ **Context building**: Bot includes relevant history in all queries

---

## Implementation Checklist

- [ ] Create `SessionManagerService` in `libs/agent/core`
- [ ] Update `AgentService` with two modes: `analyzeStock()` and `handleConversation()`
- [ ] Update `TelegramBotService` with smart routing
- [ ] Add confirmation dialog for session conflicts
- [ ] Implement `/stop` and `/status` commands
- [ ] Add implicit ticker recognition
- [ ] Set up automatic session cleanup
- [ ] Configure session timeout and limits
- [ ] Test all user flows
- [ ] Deploy and monitor