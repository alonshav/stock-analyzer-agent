# Stock Analyzer Agent - System Architecture & Refactor Guide

> **For Beginners**: This document explains how the Stock Analyzer Agent system works from the ground up. No prior knowledge required!

---

## 📚 Table of Contents
1. [What Is This System?](#what-is-this-system)
2. [The Big Picture](#the-big-picture)
3. [Core Components Explained](#core-components-explained)
4. [How Data Flows Through The System](#how-data-flows-through-the-system)
5. [Session Management: Remembering Conversations](#session-management-remembering-conversations)
6. [Hooks System: Middleware for Control](#hooks-system-middleware-for-control)
7. [The Agent Brain: Two Operating Modes](#the-agent-brain-two-operating-modes)
8. [Real-Time Streaming: SSE Explained](#real-time-streaming-sse-explained)
9. [User Experience: Telegram Bot](#user-experience-telegram-bot)
10. [Testing Strategy](#testing-strategy)
11. [What Changed in the Refactor](#what-changed-in-the-refactor)

---

## What Is This System?

The **Stock Analyzer Agent** is an AI-powered financial analysis tool that helps users analyze stocks through a conversational interface. Think of it like having a financial analyst you can chat with on Telegram.

### Key Capabilities
- 📊 **Analyze any stock** by ticker symbol (e.g., "AAPL", "TSLA")
- 💬 **Ask follow-up questions** about the analysis
- 🤖 **Powered by Claude AI** using Anthropic's Agent SDK
- 📱 **Works through Telegram** - no app to install
- ⚡ **Real-time streaming** - see analysis as it's being generated

### Who Uses This?
- Investors researching stocks
- Financial analysts needing quick insights
- Anyone curious about company performance

---

## The Big Picture

Let's start with a 10,000-foot view of how everything fits together:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         YOU (The User)                          │
│                              ↓                                  │
│                      Send: "AAPL"                              │
│                              ↓                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     📱 TELEGRAM BOT                             │
│                                                                 │
│  Receives your message and decides what to do:                  │
│  • Is it a command? (/analyze, /stop, /status)                 │
│  • Is it a stock ticker? (AAPL, TSLA, etc.)                    │
│  • Is it a follow-up question? (What's the P/E ratio?)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    🔄 STREAM MANAGER                            │
│                                                                 │
│  Opens a real-time connection (SSE) to the Agent                │
│  Receives updates and displays them to you instantly            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      🧠 AGENT SERVICE                           │
│                                                                 │
│  The "brain" of the system:                                     │
│  1. Creates a SESSION to remember your conversation             │
│  2. Calls Claude AI with your question                          │
│  3. Uses HOOKS to validate and control the process              │
│  4. Streams the answer back in real-time                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          ↓                                       ↓
┌────────────────────┐              ┌─────────────────────────┐
│  SESSION MANAGER   │              │    HOOKS SERVICE        │
│                    │              │                         │
│  Remembers:        │              │  Controls:              │
│  • What stock?     │              │  • Budget limits        │
│  • Past questions  │              │  • Validation           │
│  • Conversation    │              │  • Error handling       │
│                    │              │                         │
└────────────────────┘              └─────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  🤖 ANTHROPIC CLAUDE SDK                        │
│                                                                 │
│  The AI that:                                                   │
│  • Understands your questions                                   │
│  • Fetches financial data using tools                           │
│  • Analyzes the information                                     │
│  • Writes comprehensive responses                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    💰 FINANCIAL DATA APIs                       │
│                                                                 │
│  Real financial data from:                                      │
│  • FMP (Financial Modeling Prep) - company data                 │
│  • Alpha Vantage - market data                                  │
│  • Anvil API - PDF generation                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works in Plain English

1. **You send "AAPL"** to the Telegram bot
2. **Bot recognizes** it's a ticker symbol and starts an analysis
3. **Stream Manager opens** a real-time connection to the Agent
4. **Agent creates a session** to remember this conversation
5. **Agent asks Claude AI** to analyze AAPL
6. **Claude uses financial tools** to fetch company data
7. **Claude thinks deeply** about the data (10,000 tokens of thinking!)
8. **Analysis streams back** to you in real-time
9. **You can ask follow-up questions** and the Agent remembers context

---

## Core Components Explained

Let's dive deeper into each major component.

### 1. 📱 Telegram Bot (The Front Door)

**What it does**: Your interface to the system. It's the "face" users interact with.

**How it works**:
```
User Input → Smart Router → Appropriate Action

Examples:
"AAPL"              → Start new analysis
"/status"           → Show session status
"What's the P/E?"   → Route to conversation mode
"/stop"             → Cancel analysis
```

**Smart Routing Logic**:
```typescript
// Simplified version of what happens
if (message is a command like /analyze) {
  → Handle command
}
else if (message matches stock ticker pattern like "AAPL") {
  if (user has active session) {
    → Ask: "Start new analysis or continue current?"
  } else {
    → Start new analysis
  }
}
else if (user has active session) {
  → Treat as follow-up question (conversation mode)
}
else {
  → Reply: "Send a ticker symbol to start"
}
```

**Location**: `libs/bot/telegram/src/lib/telegram-bot.service.ts`

---

### 2. 🔄 Stream Manager (The Real-Time Messenger)

**What it does**: Manages the real-time connection between the Telegram bot and the Agent service using SSE (Server-Sent Events).

**Why we need it**:
- Analysis takes 30-60 seconds
- Users want to see progress, not wait in silence
- Shows what the AI is thinking and doing

**How SSE Works** (Simple Explanation):
```
Traditional HTTP Request:
You: "Analyze AAPL"
[... wait 60 seconds ...]
Server: "Here's the full analysis"

SSE (Server-Sent Events):
You: "Analyze AAPL"
Server: "Starting analysis..." (instant)
Server: "Fetching company data..." (2 seconds later)
Server: "Calculating valuation..." (5 seconds later)
Server: "First paragraph of analysis..." (10 seconds later)
Server: "Second paragraph..." (12 seconds later)
...
Server: "Complete!" (60 seconds later)
```

**Event Types Streamed**:
```typescript
// 1. Connection established
{
  type: 'connected',
  streamId: 'abc123',
  ticker: 'AAPL'
}

// 2. AI is thinking
{
  type: 'thinking',
  message: 'Analyzing financial data...'
}

// 3. Text content (streamed incrementally)
{
  type: 'chunk',
  content: 'Apple Inc. (AAPL) shows strong fundamentals...'
}

// 4. Tool being used
{
  type: 'tool',
  toolName: 'fetch_company_data',
  toolId: 'tool_123'
}

// 5. PDF generated
{
  type: 'pdf',
  pdfBase64: '...',
  fileSize: 21590
}

// 6. Analysis complete
{
  type: 'complete',
  metadata: { duration: '45s', model: 'claude-sonnet-4' }
}

// 7. Error occurred
{
  type: 'error',
  message: 'Failed to fetch data'
}
```

**Visual Flow**:
```
┌──────────────┐         SSE Stream          ┌──────────────┐
│              │◄────────────────────────────│              │
│   Telegram   │  connected                  │    Agent     │
│     Bot      │  thinking                   │   Service    │
│              │  chunk, chunk, chunk...     │              │
│              │  tool                       │              │
│              │  chunk, chunk...            │              │
│              │  complete                   │              │
└──────────────┘                             └──────────────┘
```

**Location**: `libs/bot/telegram/src/lib/stream-manager.service.ts`

---

### 3. 🧠 Agent Service (The Brain)

**What it does**: The core intelligence that orchestrates everything.

**Two Operating Modes**:

#### Mode 1: Workflow Mode (New Analysis)
```typescript
// User: "AAPL"
await agentService.analyzeStock(
  'chat123',  // Who's asking
  'AAPL',     // What stock
  'Analyze this company'  // What to do
);

// What happens:
// 1. Create new session for this chat
// 2. Call Claude AI with the question
// 3. Stream results back in real-time
// 4. Mark session as completed
```

#### Mode 2: Conversation Mode (Follow-up Questions)
```typescript
// User: "What is the P/E ratio?"
await agentService.handleConversation(
  'chat123',  // Who's asking
  'What is the P/E ratio?'  // Their question
);

// What happens:
// 1. Load the active session (knows it's about AAPL)
// 2. Build context from past conversation
// 3. Ask Claude AI with full context
// 4. Stream answer back
// 5. Add Q&A to conversation history
```

**The Magic of Context Building**:
```
User's first question: "AAPL"
Session created → stores ticker: "AAPL"

User's follow-up: "What's the P/E ratio?"

Agent builds context prompt:
┌─────────────────────────────────────────┐
│ You are analyzing AAPL (Apple Inc.)     │
│                                         │
│ Recent Analysis Summary:                │
│ • Strong financial performance          │
│ • Market cap: $2.8T                     │
│ • Revenue growth: 8% YoY                │
│                                         │
│ Conversation History:                   │
│ User: What's the revenue trend?         │
│ Assistant: Revenue has grown...         │
│                                         │
│ Current Question:                       │
│ User: What's the P/E ratio?            │
└─────────────────────────────────────────┘

This context helps Claude give relevant answers!
```

**Handling All 7 SDK Message Types**:

The Anthropic SDK sends 7 different types of messages. The Agent handles each one:

```typescript
1. SDKAssistantMessage
   → Full response from Claude with text, thinking, tool uses

2. SDKUserMessage
   → User's question or tool results

3. SDKResultMessage
   → Final metadata (tokens used, duration, etc.)

4. SDKSystemMessage
   → System events (initialization, compaction)

5. SDKPartialAssistantMessage (stream_event)
   → Real-time streaming chunks as Claude types

6. SDKUserMessageReplay
   → Replayed messages (just logged, not processed)

7. SDKCompactBoundaryMessage
   → Conversation compaction (when context gets too long)
```

**Visual: Message Processing Flow**:
```
Stream from Claude SDK
         ↓
┌────────────────────┐
│  For Each Message  │
└────────────────────┘
         ↓
    ┌────┴────┐
    │ Type?   │
    └────┬────┘
         ↓
    ┌────────────────────────────────────────────┐
    │                                            │
    ↓                ↓               ↓           ↓
assistant        user           result      system
    ↓                ↓               ↓           ↓
Extract text   Tool results   Metadata    Init/Compact
Emit chunks    Process PDF    Emit event  Log event
    ↓                ↓               ↓           ↓
    └────────────────┴───────────────┴───────────┘
                         ↓
              Forward to Stream Manager
                         ↓
                  Update Telegram
```

**Location**: `libs/agent/core/src/lib/agent.service.ts`

---

### 4. 💾 Session Manager (The Memory)

**What it does**: Remembers your conversations so you can have natural follow-up discussions.

**Why we need it**:
Without sessions:
```
You: "Analyze AAPL"
Bot: [Full analysis]
You: "What's the P/E ratio?"
Bot: "What company are you asking about?"  ❌ Awkward!
```

With sessions:
```
You: "Analyze AAPL"
Bot: [Full analysis]
You: "What's the P/E ratio?"
Bot: "AAPL's P/E ratio is 28.5..."  ✅ Natural!
```

**Session Structure**:
```typescript
{
  sessionId: "AAPL-1736467800000",  // Unique ID
  ticker: "AAPL",                   // What stock
  chatId: "chat123",                // Who's asking
  status: "active",                 // active|completed|stopped|expired

  // Timestamps
  startedAt: "2025-01-09T20:30:00Z",
  lastActivity: "2025-01-09T20:35:00Z",
  expiresAt: "2025-01-09T21:30:00Z",  // 1 hour from start

  // Conversation history
  conversationHistory: [
    { role: "user", content: "What's the P/E ratio?" },
    { role: "assistant", content: "AAPL's P/E is 28.5..." },
    { role: "user", content: "How does that compare?" },
    { role: "assistant", content: "Compared to sector average..." }
  ],

  // Metrics
  metrics: {
    tokens: 15000,      // Total tokens used
    toolCalls: 3,       // Number of API calls
    turns: 5,           // Conversation turns
    errors: 0           // Errors encountered
  }
}
```

**Session Lifecycle**:
```
┌──────────────┐
│   CREATE     │  User: "AAPL"
│   Session    │  → status: active
└──────┬───────┘  → expiresAt: now + 1 hour
       │
       ↓
┌──────────────┐
│   ACTIVE     │  User asks questions
│   1 hour     │  → Add to conversation history
│   window     │  → Track metrics
└──────┬───────┘  → Update lastActivity
       │
       ↓
    ┌──┴───┐
    │ Then?│
    └──┬───┘
       │
       ├──────────→┌─────────────┐
       │           │  COMPLETED  │  Analysis finished
       │           │             │  → Save results
       │           └─────────────┘  → Session kept for questions
       │
       ├──────────→┌─────────────┐
       │           │   STOPPED   │  User: /stop
       │           │             │  → Cancel analysis
       │           └─────────────┘  → Session kept briefly
       │
       └──────────→┌─────────────┐
                   │   EXPIRED   │  1 hour passed
                   │             │  → Auto-cleanup
                   └─────────────┘  → Session deleted
```

**Automatic Cleanup**:
```
Every 5 minutes, a background timer runs:

┌─────────────────────────────────────┐
│  Check all sessions:                │
│                                     │
│  For each session:                  │
│    if (now > expiresAt) {           │
│      delete session                 │
│      log cleanup                    │
│    }                                │
└─────────────────────────────────────┘

This prevents memory leaks!
```

**Key Methods**:
```typescript
// Create a new session
createSession(chatId, ticker)
  → Returns: new AnalysisSession

// Get active session for a chat
getActiveSession(chatId)
  → Returns: AnalysisSession | null

// Add a message to conversation history
addMessage(chatId, role, content)
  → Updates: conversationHistory[]

// Build context for Claude AI
buildContextPrompt(chatId, newMessage)
  → Returns: string with full context

// Complete the session
completeSession(chatId, fullAnalysis, summary)
  → Updates: status = 'completed'

// Stop the session
stopSession(chatId)
  → Updates: status = 'stopped'
```

**Location**: `libs/agent/session/src/lib/session-manager.service.ts`

---

### 5. 🎣 Hooks Service (The Quality Controller)

**What it does**: Intercepts and controls the analysis process using "hooks" (like middleware in web frameworks).

**Why we need it**: To add cross-cutting concerns without cluttering the main code:
- ✅ Validate inputs before they're used
- 💰 Enforce budget limits
- 🔒 Filter sensitive data from outputs
- 📊 Track metrics
- 🚨 Enhance error messages

**The Three Hook Types**:

#### 1️⃣ OnMessageHook (Tracks every message from Claude)
```typescript
// Fires for every message in the stream
onMessageHook(message) {
  // Log the message type
  console.log(`Received: ${message.type}`);

  // Track token usage
  if (message has usage info) {
    metrics.tokens += usage.total;
  }

  // Emit progress event
  emit('stream.progress', { type: message.type });
}
```

**Use cases**:
- Track token usage for billing
- Monitor progress
- Debug issues

#### 2️⃣ OnToolUseHook (Runs BEFORE a tool is called)
```typescript
// Fires when Claude wants to use a tool
onToolUseHook(toolUse) {
  // Validate required parameters
  if (!toolUse.input.ticker) {
    throw Error('Ticker is required!');
  }

  // Check budget
  const cost = TOOL_COSTS[toolUse.name];
  if (budget.used + cost > budget.limit) {
    throw Error('Budget exceeded!');
  }
  budget.used += cost;

  // Inject session context
  return {
    ...toolUse,
    input: {
      ...toolUse.input,
      sessionId: session.id,        // Add context
      tickerContext: session.ticker  // Add context
    }
  };
}
```

**Use cases**:
- Prevent invalid API calls
- Control costs
- Add context to tool calls

#### 3️⃣ OnToolResultHook (Runs AFTER a tool returns)
```typescript
// Fires when a tool returns a result
onToolResultHook(result) {
  // Track errors
  if (result.is_error) {
    metrics.errors += 1;

    // Enhance error message with context
    return {
      ...result,
      content: `Error analyzing ${session.ticker}: ${result.content}`
    };
  }

  // Filter sensitive data
  const data = JSON.parse(result.content);
  delete data.apiKey;      // Remove secrets!
  delete data.password;    // Remove secrets!

  // Cache result for later use
  cache.set(result.tool_use_id, data);

  return {
    ...result,
    content: JSON.stringify(data)
  };
}
```

**Use cases**:
- Filter sensitive data
- Enhance error messages
- Cache results
- Track metrics

**Visual: Hook Execution Flow**:
```
Claude wants to fetch company data
           ↓
    ┌──────────────┐
    │ OnToolUse    │  ← BEFORE tool execution
    │ Hook         │    • Validate inputs
    └──────┬───────┘    • Check budget
           ↓            • Inject context
    ┌──────────────┐
    │ Execute Tool │    Fetch data from API
    └──────┬───────┘
           ↓
    ┌──────────────┐
    │ OnToolResult │  ← AFTER tool execution
    │ Hook         │    • Filter secrets
    └──────┬───────┘    • Cache results
           ↓            • Track errors
    Return to Claude
```

**Budget Control Example**:
```typescript
// Set a budget for a session
hooksService.setBudget(sessionId, {
  limit: 10.0,           // Max $10
  used: 0.0,             // Start at $0
  toolCosts: {
    fetch_company_data: 0.50,   // $0.50 per call
    calculate_dcf: 0.10,        // $0.10 per call
    test_api_connection: 0.01   // $0.01 per call
  }
});

// Now if Claude tries to use tools excessively:
Tool call #1: fetch_company_data → used = $0.50 ✅
Tool call #2: fetch_company_data → used = $1.00 ✅
Tool call #3: calculate_dcf      → used = $1.10 ✅
...
Tool call #22: fetch_company_data → used = $10.50 ❌ REJECTED!
// Error thrown: "Budget exceeded"
```

**Sensitive Data Filtering Example**:
```typescript
// Tool returns data with secrets
{
  "ticker": "AAPL",
  "price": 150.25,
  "apiKey": "sk-secret123",      // ⚠️ Sensitive!
  "password": "admin123",        // ⚠️ Sensitive!
  "token": "bearer_xyz"          // ⚠️ Sensitive!
}

// After OnToolResultHook:
{
  "ticker": "AAPL",
  "price": 150.25
  // Secrets removed! ✅
}
```

**Location**: `libs/agent/hooks/src/lib/hooks.service.ts`

---

## How Data Flows Through The System

Let's trace a complete request from start to finish.

### Scenario: User asks "AAPL"

#### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: User Input                                              │
└─────────────────────────────────────────────────────────────────┘

You type "AAPL" in Telegram → Message sent to bot

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 2: TelegramBotService Receives Message                    │
└─────────────────────────────────────────────────────────────────┘

handleTextMessage(ctx) {
  text = "AAPL"
  chatId = "123456789"

  // Check: Is it a ticker? (1-5 uppercase letters)
  if (/^[A-Z]{1,5}$/.test(text)) {  ✅ YES

    // Check: Does user have active session?
    hasActiveSession(chatId)  → false

    // Route to analysis
    handleAnalyzeCommand(ctx)
  }
}

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 3: StreamManager Starts SSE Connection                     │
└─────────────────────────────────────────────────────────────────┘

streamManager.startStream({
  chatId: "123456789",
  ticker: "AAPL",
  ctx: telegramContext,
  messageId: 42,
  agentUrl: "http://localhost:3001"
})

Opens EventSource:
  → GET http://localhost:3001/api/analyze/stream?ticker=AAPL&chatId=123456789

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 4: AgentService Receives Request                          │
└─────────────────────────────────────────────────────────────────┘

analyzeStock(chatId, ticker, prompt) {

  // Create session
  session = sessionManager.createSession(chatId, ticker)
  // Session: { id: "AAPL-1736467800", ticker: "AAPL", status: "active" }

  // Build prompt for Claude
  prompt = `Analyze ${ticker} using the Stock Valuation Framework...`

  // Call Claude SDK
  stream = query({ prompt, options: {...} })

  // Process stream...
}

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Claude SDK Processes Request                           │
└─────────────────────────────────────────────────────────────────┘

Claude AI receives:
  System Prompt: "You are a financial analyst. Use these tools:
                  - fetch_company_data
                  - calculate_dcf
                  ..."

  User Prompt: "Analyze AAPL using the Stock Valuation Framework..."

Claude decides:
  "I need to fetch company data first"

Claude emits:
  {
    type: 'assistant',
    content: [{
      type: 'tool_use',
      name: 'fetch_company_data',
      input: { ticker: 'AAPL', period: 'quarter', limit: 8 }
    }]
  }

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Hooks Intercept Tool Call                              │
└─────────────────────────────────────────────────────────────────┘

PreToolUse Hook fires:

  onToolUseHook({
    name: 'fetch_company_data',
    input: { ticker: 'AAPL', period: 'quarter', limit: 8 }
  })

  ✅ Validate: ticker exists → PASS
  ✅ Check budget: $0.50 cost, under limit → PASS
  ✅ Track metric: toolCalls += 1
  ✅ Inject context: add sessionId

  → Allow tool execution

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 7: Tool Executes (Fetch Company Data)                     │
└─────────────────────────────────────────────────────────────────┘

fetch_company_data() {
  // Call FMP API
  response = await fmpApi.get('/profile/AAPL')
  response = await fmpApi.get('/quote/AAPL')
  response = await fmpApi.get('/income-statement/AAPL?period=quarter&limit=8')

  // Return data
  return {
    profile: { companyName: "Apple Inc.", ... },
    quote: { price: 150.25, ... },
    financials: [ {...}, {...}, ... ]
  }
}

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 8: Hooks Process Tool Result                              │
└─────────────────────────────────────────────────────────────────┘

PostToolUse Hook fires:

  onToolResultHook({
    tool_use_id: 'toolu_123',
    content: '{ profile: {...}, quote: {...}, ... }',
    is_error: false
  })

  ✅ Check for errors → No errors
  ✅ Filter sensitive data → Remove API keys
  ✅ Cache result → Store in cache

  → Return filtered result to Claude

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 9: Claude Analyzes Data                                   │
└─────────────────────────────────────────────────────────────────┘

Claude receives filtered data:
  { profile: {...}, quote: {...}, financials: [...] }

Claude thinks (extended thinking, 10,000 tokens):
  "Let me analyze this...
   - Revenue trend: Growing 8% YoY
   - Profit margins: Strong at 25%
   - P/E ratio: 28.5, above sector average
   - Quality score: 15/18
   ..."

Claude emits (streaming):
  { type: 'stream_event', content: 'Apple Inc. (AAPL) demonstrates' }
  { type: 'stream_event', content: ' strong financial performance' }
  { type: 'stream_event', content: ' with revenue growing at 8%...' }
  ...

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 10: AgentService Processes Stream                         │
└─────────────────────────────────────────────────────────────────┘

for await (message of stream) {

  // Track message via hook
  onMessageHook(message)  → Track tokens, emit progress

  // Handle message type
  if (message.type === 'stream_event') {
    // Emit chunk event
    eventEmitter.emit(`analysis.chunk.${sessionId}`, {
      ticker: 'AAPL',
      type: 'text',
      content: message.content
    })
  }
}

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 11: StreamManager Receives Events via SSE                 │
└─────────────────────────────────────────────────────────────────┘

EventSource receives SSE messages:

data: {"type":"connected","ticker":"AAPL"}

data: {"type":"thinking","message":"Analyzing data..."}

data: {"type":"tool","toolName":"fetch_company_data"}

data: {"type":"chunk","content":"Apple Inc. (AAPL) demonstrates"}

data: {"type":"chunk","content":" strong financial performance"}

data: {"type":"chunk","content":" with revenue growing at 8%..."}

...

data: {"type":"complete","metadata":{"duration":"45s"}}

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 12: StreamManager Updates Telegram                        │
└─────────────────────────────────────────────────────────────────┘

For each event:

  case 'thinking':
    ctx.sendChatAction('typing')  → Show typing indicator

  case 'chunk':
    buffer += content             → Accumulate text
    if (should update) {          → Throttle: every 1s or 10 chunks
      ctx.telegram.editMessageText(buffer)  → Update message
    }

  case 'tool':
    buffer += `\n📊 Using ${toolName}...`

  case 'complete':
    buffer += `\n\n✅ Analysis complete!`
    buffer += `\n⏱️ Duration: ${duration}`
    buffer += `\n💬 You can now ask follow-up questions!`
    ctx.telegram.editMessageText(buffer)

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 13: SessionManager Completes Session                      │
└─────────────────────────────────────────────────────────────────┘

sessionManager.completeSession(chatId, analysis, summary)

Session updated:
  {
    id: "AAPL-1736467800",
    ticker: "AAPL",
    status: "completed",  ← Changed from "active"
    completedAt: "2025-01-09T20:31:45Z",
    executiveSummary: "Apple Inc. demonstrates...",
    metrics: {
      tokens: 15000,
      toolCalls: 1,
      turns: 1,
      errors: 0
    }
  }

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 14: You See The Result! 🎉                                │
└─────────────────────────────────────────────────────────────────┘

Your Telegram shows:

  📊 Analyzing AAPL...

  📊 Using fetch_company_data...

  Apple Inc. (AAPL) demonstrates strong financial performance
  with revenue growing at 8% year-over-year. The company maintains
  impressive profit margins of 25%, reflecting operational efficiency
  and pricing power...

  [Full analysis continues...]

  ✅ Analysis complete!
  ⏱️ Duration: 45s
  🤖 Model: claude-sonnet-4

  💬 You can now ask follow-up questions!
```

---

### Scenario: User asks follow-up "What's the P/E ratio?"

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: User Input                                              │
└─────────────────────────────────────────────────────────────────┘

You type "What's the P/E ratio?" in Telegram

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 2: TelegramBotService Routes to Conversation              │
└─────────────────────────────────────────────────────────────────┘

handleTextMessage(ctx) {
  text = "What's the P/E ratio?"
  chatId = "123456789"

  // Check: Is it a ticker?
  /^[A-Z]{1,5}$/.test(text)  → false ❌

  // Check: Does user have active session?
  hasActiveSession(chatId)  → true ✅

  // Route to conversation mode
  handleConversation(ctx, text)
}

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 3: SessionManager Builds Context                          │
└─────────────────────────────────────────────────────────────────┘

session = sessionManager.getActiveSession(chatId)
// Returns: { ticker: "AAPL", conversationHistory: [...] }

contextPrompt = sessionManager.buildContextPrompt(chatId, text)

// Builds:
`
You are analyzing AAPL (Apple Inc.).

Recent Analysis Summary:
• Strong financial performance
• Revenue growing 8% YoY
• Profit margin: 25%
• Quality score: 15/18

Conversation History:
(empty - this is first follow-up)

Current Question:
User: What's the P/E ratio?
`

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 4: AgentService Handles Conversation                      │
└─────────────────────────────────────────────────────────────────┘

handleConversation(chatId, message) {

  // Load session
  session = sessionManager.getActiveSession(chatId)

  // Build context
  contextPrompt = sessionManager.buildContextPrompt(chatId, message)

  // Call Claude with context
  result = await executeQuery({
    prompt: contextPrompt,
    phase: 'conversation'
  })

  // Add to history
  sessionManager.addMessage(chatId, 'user', message)
  sessionManager.addMessage(chatId, 'assistant', result)

  return result
}

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Claude Answers with Context                            │
└─────────────────────────────────────────────────────────────────┘

Claude receives the context prompt and understands:
  • User is asking about AAPL
  • Previous analysis had the data
  • Question is about P/E ratio specifically

Claude responds:
  "Based on the analysis, Apple Inc. (AAPL) has a P/E ratio of 28.5,
   which is above the technology sector average of 24.2. This indicates
   the market is willing to pay a premium for Apple's earnings..."

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Response Streamed to User                              │
└─────────────────────────────────────────────────────────────────┘

You see in Telegram:

  💭 Thinking...

  Based on the analysis, Apple Inc. (AAPL) has a P/E ratio of 28.5,
  which is above the technology sector average of 24.2. This indicates
  the market is willing to pay a premium for Apple's earnings...

  ✅ Response complete!

         ↓

┌─────────────────────────────────────────────────────────────────┐
│ Step 7: Session History Updated                                │
└─────────────────────────────────────────────────────────────────┘

Session now contains:
  {
    conversationHistory: [
      {
        role: "user",
        content: "What's the P/E ratio?"
      },
      {
        role: "assistant",
        content: "Based on the analysis, Apple Inc. (AAPL) has..."
      }
    ]
  }

This will be used for the NEXT follow-up question!
```

---

## Real-Time Streaming: SSE Explained

### What is SSE (Server-Sent Events)?

SSE is a technology that allows a server to push updates to a client over HTTP.

**Real-World Analogy**:
```
Traditional HTTP = Postal Mail
  • You send a letter (request)
  • You wait
  • You get one response (letter back)
  • Conversation over

SSE = Text Messaging
  • You send a message (request)
  • Server keeps connection open
  • Server sends multiple messages as things happen
  • You see updates in real-time
```

### How SSE Works in Our System

```
┌──────────────┐                              ┌──────────────┐
│   Telegram   │                              │    Agent     │
│     Bot      │                              │   Service    │
└──────────────┘                              └──────────────┘
        │                                              │
        │  1. Open SSE connection                     │
        │─────────────────────────────────────────────>│
        │     GET /api/analyze/stream?ticker=AAPL     │
        │                                              │
        │  2. Connection established                  │
        │<─────────────────────────────────────────────│
        │     data: {"type":"connected"}              │
        │                                              │
        │                                              │
        │  3. Thinking event                          │
        │<─────────────────────────────────────────────│
        │     data: {"type":"thinking"}               │
        │                                              │
        │                                              │
        │  4. Text chunks (streaming)                 │
        │<─────────────────────────────────────────────│
        │     data: {"type":"chunk","content":"App"}  │
        │<─────────────────────────────────────────────│
        │     data: {"type":"chunk","content":"le "}  │
        │<─────────────────────────────────────────────│
        │     data: {"type":"chunk","content":"Inc"}  │
        │                                              │
        │  ... many more chunks ...                   │
        │                                              │
        │  5. Tool event                              │
        │<─────────────────────────────────────────────│
        │     data: {"type":"tool"}                   │
        │                                              │
        │  6. More chunks                             │
        │<─────────────────────────────────────────────│
        │     data: {"type":"chunk","content":"..."}  │
        │                                              │
        │  7. Complete event                          │
        │<─────────────────────────────────────────────│
        │     data: {"type":"complete"}               │
        │                                              │
        │  8. Connection closes                       │
        │                                              │
```

### SSE Message Format

Every SSE message starts with `data:` and ends with two newlines:

```
data: {"type":"chunk","content":"Hello"}\n\n
│     │                                 │└─ Second newline (end of message)
│     │                                 └── First newline
│     └──────────────────────────────────── JSON payload
└──────────────────────────────────────────── SSE prefix
```

### Throttling: Why We Don't Send Every Chunk Immediately

**Problem**: Claude generates text fast (100+ chunks per second). If we update Telegram for every chunk:
- Telegram rate limits kick in (max ~30 messages/second)
- Messages get dropped
- User experience is janky

**Solution**: Throttle updates

```typescript
const THROTTLE_TIME = 1000;  // 1 second
const THROTTLE_CHUNKS = 10;  // or 10 chunks

let buffer = "";
let chunkCount = 0;
let lastUpdate = Date.now();

// For each chunk received:
buffer += chunk.content;
chunkCount++;

const shouldUpdate = (
  (Date.now() - lastUpdate) > THROTTLE_TIME ||  // 1 second passed
  chunkCount >= THROTTLE_CHUNKS                  // 10 chunks accumulated
);

if (shouldUpdate) {
  telegram.editMessageText(buffer);  // Update Telegram
  chunkCount = 0;
  lastUpdate = Date.now();
}
```

**Visual Comparison**:

```
Without Throttling:
Claude chunk 1   →  Telegram update 1
Claude chunk 2   →  Telegram update 2  ← Rate limited!
Claude chunk 3   →  Telegram update 3  ← Rate limited!
Claude chunk 4   →  Telegram update 4  ← Rate limited!
... chaos ...

With Throttling:
Claude chunk 1   →  |
Claude chunk 2   →  |  Buffer
Claude chunk 3   →  |  accumulates
...              →  |
Claude chunk 10  →  |
                    ↓
                Telegram update 1 (10 chunks at once) ✅
```

---

## Session Management: Remembering Conversations

### Why Sessions Matter

**Without sessions**, every question is isolated:

```
Conversation 1:
  User: "Analyze AAPL"
  Bot: [Analysis]

Conversation 2 (new, no memory):
  User: "What's the P/E?"
  Bot: "I don't know what company you're asking about"  ❌
```

**With sessions**, conversations have memory:

```
Session created:
  User: "Analyze AAPL"
  Bot: [Analysis]
  Session stores: ticker=AAPL, history=[], status=completed

Same session continues:
  User: "What's the P/E?"
  Bot: "AAPL's P/E is 28.5"  ✅ (knows it's AAPL!)
  Session stores: history=[Q&A], last_activity=now

Same session continues:
  User: "How does that compare?"
  Bot: "Compared to sector average of 24.2..."  ✅ (remembers context!)
```

### Session Expiration: The 1-Hour Window

Every session expires after 1 hour for two reasons:

1. **Memory Management**: Can't keep all sessions forever
2. **Context Freshness**: After 1 hour, user probably moved on

```
Timeline:

00:00 - User: "Analyze AAPL"
        Session created: expires at 01:00

00:05 - User: "What's the P/E?"
        Session active: expires at 01:00 (unchanged)

00:30 - User: "How about revenue?"
        Session active: expires at 01:00 (unchanged)

01:00 - [Session expires]
        Status: expired

01:05 - [Cleanup timer runs]
        Session deleted from memory

01:10 - User: "What was the P/E?"
        No active session → "Send a ticker to start"
```

### Context Building: How Past Context is Used

When you ask a follow-up question, the Agent builds a rich context prompt:

```typescript
// You ask: "What's the P/E ratio?"

// Agent builds this prompt for Claude:
`
You are analyzing AAPL (Apple Inc.).

=== RECENT ANALYSIS SUMMARY ===
Analysis from 30 minutes ago:
• Status: Strong financial performance
• Revenue: $90B (growing 8% YoY)
• Profit margin: 25%
• Market cap: $2.8T
• Quality score: 15/18

=== CONVERSATION HISTORY ===
User: How is the revenue trend?
Assistant: Revenue has been growing at 8% year-over-year,
showing consistent expansion despite market headwinds...

User: What about margins?
Assistant: Profit margins are at 25%, which is excellent
for the technology sector...

=== CURRENT QUESTION ===
User: What's the P/E ratio?
`

// Claude now has FULL CONTEXT and can answer intelligently!
```

**Comparison: Without vs With Context**

```
WITHOUT CONTEXT:
  Prompt: "What's the P/E ratio?"
  Claude: "I need more information. What company?"  ❌

WITH CONTEXT:
  Prompt: [Full context above] + "What's the P/E ratio?"
  Claude: "Based on the AAPL analysis, the P/E ratio is 28.5,
           which is above the sector average..."  ✅
```

### Session Metrics: What We Track

Every session tracks metrics for monitoring and debugging:

```typescript
metrics: {
  tokens: 15234,       // Total tokens used (input + output)
  toolCalls: 3,        // Number of tool calls made
  turns: 5,            // Conversation turns (user + assistant pairs)
  errors: 0            // Errors encountered
}
```

**Why these metrics matter**:

- **Tokens**: Tracks API costs (Anthropic charges per token)
- **Tool Calls**: Tracks external API usage and costs
- **Turns**: Measures conversation length
- **Errors**: Quality monitoring

**Example metrics progression**:

```
Initial analysis:
  tokens: 12,000 (analysis is token-heavy)
  toolCalls: 1 (fetch_company_data)
  turns: 1
  errors: 0

After follow-up #1:
  tokens: 14,500 (+2,500)
  toolCalls: 1 (no new tools needed)
  turns: 2 (+1)
  errors: 0

After follow-up #2:
  tokens: 15,234 (+734)
  toolCalls: 1
  turns: 3 (+1)
  errors: 0
```

---

## Hooks System: Middleware for Control

### What Are Hooks?

**Hooks** are functions that run at specific points in the analysis process, similar to middleware in web frameworks.

**Real-World Analogy**:
```
Think of hooks like security checkpoints at an airport:

1. Before boarding (PreToolUse):
   • Check ID
   • Verify ticket
   • Screen luggage

2. During flight (OnMessage):
   • Monitor passenger behavior
   • Track flight progress

3. After landing (PostToolUse):
   • Verify arrival
   • Process customs
   • Return luggage
```

### The Three Hook Types (Visual)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYSIS LIFECYCLE                           │
└─────────────────────────────────────────────────────────────────┘

    Claude Sends Message
           │
           ↓
    ┌─────────────┐
    │ OnMessage   │  ← Hook fires for EVERY message
    │ Hook        │    • Log message type
    └──────┬──────┘    • Track token usage
           │            • Emit progress events
           ↓
    ┌──────────────────────────────────────────────────────────┐
    │ Is this a tool use message?                              │
    └──────┬───────────────────────────────┬───────────────────┘
           │ YES                           │ NO
           ↓                               ↓
    ┌─────────────┐                    Continue
    │ OnToolUse   │                    processing
    │ Hook        │  ← Hook fires BEFORE tool execution
    └──────┬──────┘    • Validate inputs
           │            • Check budget
           │            • Inject context
           ↓
    Execute Tool
    (Fetch data, calculate, etc.)
           │
           ↓
    ┌─────────────┐
    │ OnToolResult│  ← Hook fires AFTER tool execution
    │ Hook        │    • Filter sensitive data
    └──────┬──────┘    • Cache results
           │            • Enhance errors
           ↓
    Return to Claude
```

### Hook Example: Budget Control

Let's see how budget control works step-by-step:

**Setup**:
```typescript
// Set budget for session
hooksService.setBudget('session-123', {
  limit: 5.0,     // Max $5
  used: 0.0,      // Start at $0
  toolCosts: {
    fetch_company_data: 0.50,
    calculate_dcf: 0.20,
    test_api_connection: 0.01
  }
});
```

**Execution Flow**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Tool Call #1: fetch_company_data                                │
└─────────────────────────────────────────────────────────────────┘

OnToolUse Hook:
  Check budget:
    limit: $5.00
    used: $0.00
    cost: $0.50
    after: $0.50

  $0.50 < $5.00?  ✅ YES
  → Allow tool execution
  → Update used: $0.50

Result: Tool executes successfully

┌─────────────────────────────────────────────────────────────────┐
│ Tool Call #2: calculate_dcf                                     │
└─────────────────────────────────────────────────────────────────┘

OnToolUse Hook:
  Check budget:
    limit: $5.00
    used: $0.50
    cost: $0.20
    after: $0.70

  $0.70 < $5.00?  ✅ YES
  → Allow tool execution
  → Update used: $0.70

Result: Tool executes successfully

┌─────────────────────────────────────────────────────────────────┐
│ Tool Call #3-10: More tool calls...                            │
└─────────────────────────────────────────────────────────────────┘

[... multiple successful tool calls ...]

Budget now: $4.90 used

┌─────────────────────────────────────────────────────────────────┐
│ Tool Call #11: fetch_company_data                               │
└─────────────────────────────────────────────────────────────────┘

OnToolUse Hook:
  Check budget:
    limit: $5.00
    used: $4.90
    cost: $0.50
    after: $5.40

  $5.40 < $5.00?  ❌ NO
  → BLOCK tool execution
  → Throw error: "Budget exceeded"

Result: Tool call rejected, analysis continues without this data
```

### Hook Example: Sensitive Data Filtering

Let's see how we filter secrets from tool results:

**Tool Returns Data** (contains secrets):
```json
{
  "ticker": "AAPL",
  "price": 150.25,
  "volume": 50000000,
  "apiKey": "sk-secret-key-12345",
  "database_password": "admin123",
  "auth_token": "bearer_xyz789"
}
```

**OnToolResultHook Processes**:
```typescript
function filterSensitiveData(content: string): string {
  try {
    const data = JSON.parse(content);

    // Remove sensitive keys
    const sensitiveKeys = [
      'apiKey', 'api_key', 'API_KEY',
      'password', 'pwd', 'PASSWORD',
      'token', 'auth_token', 'TOKEN',
      'secret', 'SECRET'
    ];

    for (const key of sensitiveKeys) {
      delete data[key];
    }

    return JSON.stringify(data);
  } catch {
    // Not JSON, return as-is
    return content;
  }
}
```

**Filtered Result** (secrets removed):
```json
{
  "ticker": "AAPL",
  "price": 150.25,
  "volume": 50000000
}
```

**Why This Matters**:
- Prevents API keys from being exposed in logs
- Protects sensitive data from being sent to Claude
- Ensures compliance with security best practices

---

## The Agent Brain: Two Operating Modes

The Agent operates in two distinct modes depending on what the user wants.

### Mode Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                        MODE 1: WORKFLOW                         │
│                     (New Stock Analysis)                        │
└─────────────────────────────────────────────────────────────────┘

WHEN: User starts fresh analysis
TRIGGER: User sends ticker symbol (e.g., "AAPL")
METHOD: analyzeStock(chatId, ticker, prompt)

WHAT HAPPENS:
  1. Create new session
  2. Run full stock analysis
  3. Use financial tools (fetch data, calculate DCF)
  4. Generate executive summary
  5. Complete session
  6. Session remains active for follow-ups

DURATION: 30-60 seconds
OUTPUT: Comprehensive stock analysis (2000+ words)

┌─────────────────────────────────────────────────────────────────┐
│                     MODE 2: CONVERSATION                        │
│                      (Follow-up Questions)                      │
└─────────────────────────────────────────────────────────────────┘

WHEN: User asks follow-up questions
TRIGGER: User sends text while session is active
METHOD: handleConversation(chatId, message)

WHAT HAPPENS:
  1. Load active session
  2. Build context from past analysis + conversation
  3. Ask Claude with full context
  4. Stream answer
  5. Add Q&A to conversation history
  6. Session remains active

DURATION: 5-15 seconds
OUTPUT: Targeted answer to specific question (200-500 words)
```

### Workflow Mode: Deep Dive

**User Action**: Sends "AAPL"

**System Response**:
```typescript
async analyzeStock(chatId, ticker, prompt) {

  // 1. Create session
  const session = this.sessionManager.createSession(chatId, ticker);
  console.log(`Session created: ${session.sessionId}`);

  // 2. Build comprehensive prompt
  const fullPrompt = `
    ${STOCK_VALUATION_FRAMEWORK}

    Analyze ${ticker} comprehensively:
    - Fetch financial data (8 quarters)
    - Calculate DCF valuation
    - Assess quality (6 dimensions)
    - Evaluate risks
    - Provide investment recommendation
  `;

  // 3. Call Claude SDK with extended thinking
  const stream = query({
    prompt: fullPrompt,
    options: {
      model: 'claude-sonnet-4',
      maxThinkingTokens: 10000,  ← Deep analysis!
      maxTurns: 20,               ← Multi-step reasoning
      mcpServers: { 'stock-analyzer': this.mcpServer }
    }
  });

  // 4. Process stream (text, thinking, tool calls)
  let fullContent = '';
  for await (const message of stream) {
    if (message.type === 'assistant') {
      // Extract text content
      fullContent += extractText(message);

      // Emit chunks for real-time display
      this.eventEmitter.emit(`analysis.chunk.${session.sessionId}`, {
        content: extractText(message)
      });
    }
  }

  // 5. Complete session
  this.sessionManager.completeSession(
    chatId,
    fullContent,
    extractSummary(fullContent)
  );

  return {
    ticker,
    executiveSummary: extractSummary(fullContent),
    fullAnalysis: fullContent,
    sessionId: session.sessionId
  };
}
```

**Timeline**:
```
00:00 - User sends "AAPL"
00:01 - Session created
00:02 - Claude starts thinking
00:05 - Tool call: fetch_company_data
00:08 - Data received
00:10 - Claude resumes thinking
00:15 - First paragraph streamed
00:20 - Second paragraph streamed
00:25 - Tool call: calculate_dcf
00:28 - DCF result received
00:30 - Continue streaming analysis
00:45 - Analysis complete
00:46 - Session marked as completed
00:47 - User sees: "Analysis complete! Ask follow-up questions"
```

### Conversation Mode: Deep Dive

**User Action**: Sends "What's the P/E ratio?" (while session is active)

**System Response**:
```typescript
async handleConversation(chatId, message) {

  // 1. Load active session
  const session = this.sessionManager.getActiveSession(chatId);
  if (!session) {
    throw new Error('No active session');
  }

  console.log(`Session found: ${session.ticker}`);

  // 2. Build context from session
  const contextPrompt = this.sessionManager.buildContextPrompt(
    chatId,
    message
  );

  // Context includes:
  // - Ticker being analyzed
  // - Recent analysis summary
  // - Past conversation history
  // - Current question

  // 3. Call Claude with context
  const stream = query({
    prompt: contextPrompt,
    options: {
      model: 'claude-sonnet-4',
      maxThinkingTokens: 5000,   ← Less thinking needed
      maxTurns: 5,               ← Simpler query
      mcpServers: { 'stock-analyzer': this.mcpServer }
    }
  });

  // 4. Process stream
  let response = '';
  for await (const message of stream) {
    if (message.type === 'assistant') {
      response += extractText(message);

      // Stream response in real-time
      this.eventEmitter.emit(`conversation.chunk.${session.sessionId}`, {
        content: extractText(message)
      });
    }
  }

  // 5. Update conversation history
  this.sessionManager.addMessage(chatId, 'user', message);
  this.sessionManager.addMessage(chatId, 'assistant', response);

  return response;
}
```

**Timeline**:
```
00:00 - User sends "What's the P/E ratio?"
00:01 - Session loaded (knows it's AAPL)
00:02 - Context built from past analysis
00:03 - Claude receives context + question
00:04 - Claude starts thinking (has all context)
00:06 - Answer starts streaming
00:08 - Full answer complete
00:09 - Q&A added to history
00:10 - User sees: "Response complete!"
```

### Mode Switching

The system automatically detects which mode to use:

```
┌─────────────────────────────────────────────────────────────────┐
│                   SMART MODE DETECTION                          │
└─────────────────────────────────────────────────────────────────┘

Input received → Check session

                ┌────────────────────┐
                │ Active session?    │
                └─────────┬──────────┘
                          │
          ┌───────────────┴────────────────┐
          │ NO                             │ YES
          ↓                                ↓
    ┌──────────┐                    ┌──────────────┐
    │ Ticker?  │                    │ Ticker?      │
    └────┬─────┘                    └──────┬───────┘
         │                                  │
    ┌────┴─────┐                    ┌──────┴───────┐
    │ YES      │ NO                 │ YES          │ NO
    ↓          ↓                    ↓              ↓
 WORKFLOW    ERROR              CONFLICT      CONVERSATION
  MODE       MODE                MODE           MODE
    │          │                    │              │
    ↓          ↓                    ↓              ↓
 Start new  "Send             "Start new      Process
 analysis   ticker"           or continue?"  follow-up
```

**Examples**:

```
Scenario 1:
  Input: "AAPL"
  Session: None
  → WORKFLOW MODE (start new analysis)

Scenario 2:
  Input: "What's the P/E?"
  Session: None
  → ERROR ("No active session")

Scenario 3:
  Input: "What's the P/E?"
  Session: Active (AAPL)
  → CONVERSATION MODE (answer question)

Scenario 4:
  Input: "TSLA"
  Session: Active (AAPL)
  → CONFLICT MODE ("Start new analysis or continue?")
```

---

## User Experience: Telegram Bot

Let's walk through what users see when they interact with the bot.

### Scenario 1: First-Time User

**User opens Telegram and searches for the bot**

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│  @StockAnalyzerBot                          │
│                                             │
│  [START]                                    │
└─────────────────────────────────────────────┘
```

**User taps START**

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
├─────────────────────────────────────────────┤
│                                             │
│  👋 Welcome to Stock Analyzer Bot!          │
│                                             │
│  This bot uses an AI agent with financial   │
│  analysis tools to perform comprehensive    │
│  stock analysis.                            │
│                                             │
│  📋 Commands:                               │
│  /analyze TICKER - Start new analysis       │
│  /status - Check active session             │
│  /stop - Stop current analysis              │
│  /help - Show detailed help                 │
│                                             │
│  💡 Tips:                                   │
│  • Just send a ticker symbol (e.g., AAPL)   │
│  • Ask follow-up questions during active    │
│    sessions                                 │
│  • Sessions auto-expire after 1 hour        │
│                                             │
└─────────────────────────────────────────────┘
```

### Scenario 2: Starting an Analysis

**User types: AAPL**

```
┌─────────────────────────────────────────────┐
│  You                                        │
│  AAPL                                   ←────┤
└─────────────────────────────────────────────┘
```

**Bot immediately responds**:

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│  Analyzing AAPL...                          │
│                                             │
│  📊 Fetching AAPL financial data...         │
│  • Data: Company Profile, Stock Quote,      │
│    Income Statements                        │
│  • Period: Last 8 quarters                  │
└─────────────────────────────────────────────┘
```

**A few seconds later** (message updates in real-time):

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│  Analyzing AAPL...                          │
│                                             │
│  📊 Fetching AAPL financial data...         │
│  • Data: Company Profile, Stock Quote,      │
│    Income Statements                        │
│  • Period: Last 8 quarters                  │
│                                             │
│  ✅ Financial data retrieved successfully!  │
│                                             │
│  💭 Claude is analyzing the data...         │
└─────────────────────────────────────────────┘
```

**Analysis streams in** (updates every 1-2 seconds):

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│  Analyzing AAPL...                          │
│                                             │
│  Apple Inc. (AAPL) - Technology Sector      │
│                                             │
│  ## Executive Summary                       │
│                                             │
│  Apple Inc. demonstrates strong financial   │
│  performance with revenue growing at 8%     │
│  year-over-year. The company maintains      │
│  impressive profit margins of 25%,          │
│  reflecting operational efficiency and      │
│  pricing power.                             │
│                                             │
│  ### Key Financials                         │
│  • Market Cap: $2.8T                        │
│  • P/E Ratio: 28.5 (above sector avg)       │
│  • Revenue (TTM): $385B                     │
│  • Net Income: $96B                         │
│                                             │
│  [More analysis continues streaming...]     │
└─────────────────────────────────────────────┘
```

**Analysis completes** (final message):

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│                                             │
│  [Full analysis displayed above]            │
│                                             │
│  ## Conclusion                              │
│                                             │
│  AAPL presents a MODERATE BUY opportunity   │
│  with a quality score of 15/18. The        │
│  company's strong fundamentals justify the  │
│  premium valuation, though investors should │
│  monitor margins and competitive dynamics.  │
│                                             │
│  ✅ Analysis complete!                      │
│                                             │
│  ⏱️ Duration: 45s                           │
│  🤖 Model: claude-sonnet-4-20250514         │
│  📊 Framework: v2.3                         │
│                                             │
│  💬 You can now ask follow-up questions!    │
└─────────────────────────────────────────────┘
```

### Scenario 3: Asking Follow-Up Questions

**User types: What is the P/E ratio compared to competitors?**

```
┌─────────────────────────────────────────────┐
│  You                                        │
│  What is the P/E ratio compared to      ←────┤
│  competitors?                               │
└─────────────────────────────────────────────┘
```

**Bot responds**:

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│  💭 Thinking...                             │
└─────────────────────────────────────────────┘
```

**Answer streams in** (much faster than initial analysis):

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│                                             │
│  Based on the analysis, Apple Inc. (AAPL)   │
│  has a P/E ratio of 28.5, which is above    │
│  the technology sector average of 24.2.     │
│                                             │
│  Compared to direct competitors:            │
│  • Microsoft (MSFT): 32.1                   │
│  • Google (GOOGL): 25.8                     │
│  • Amazon (AMZN): 45.2                      │
│                                             │
│  AAPL's P/E is reasonable given its:        │
│  1. Stable revenue streams (iPhone, Services)│
│  2. Strong brand loyalty                    │
│  3. Consistent profit margins               │
│  4. Cash flow generation                    │
│                                             │
│  The premium to sector average is justified │
│  by Apple's market position and financial   │
│  stability.                                 │
│                                             │
│  ✅ Response complete!                      │
└─────────────────────────────────────────────┘
```

**User continues conversation**:

```
┌─────────────────────────────────────────────┐
│  You                                        │
│  What are the main risks?               ←────┤
└─────────────────────────────────────────────┘
```

**Bot responds with context from entire conversation**:

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│                                             │
│  Based on the AAPL analysis, the main       │
│  risks to monitor are:                      │
│                                             │
│  1. **Multiple Compression Risk**           │
│     The P/E of 28.5 assumes continued       │
│     growth. Any slowdown could lead to      │
│     valuation reset.                        │
│                                             │
│  2. **Revenue Concentration**               │
│     iPhone still represents ~50% of revenue.│
│     A product cycle miss would significantly│
│     impact results.                         │
│                                             │
│  3. **Competitive Pressure**                │
│     Growing competition in smartphones and  │
│     services could pressure margins.        │
│                                             │
│  4. **Regulatory Risk**                     │
│     Antitrust scrutiny on App Store and     │
│     ecosystem lock-in could force changes.  │
│                                             │
│  5. **China Exposure**                      │
│     ~20% of revenue from China creates      │
│     geopolitical risk.                      │
│                                             │
│  ✅ Response complete!                      │
└─────────────────────────────────────────────┘
```

### Scenario 4: Session Status Check

**User types: /status**

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│                                             │
│  📊 Session Status                          │
│                                             │
│  Stock: AAPL                                │
│  Status: completed                          │
│  Started: 2025-01-09T20:30:00Z              │
│                                             │
│  💬 You can ask follow-up questions about   │
│  this analysis.                             │
└─────────────────────────────────────────────┘
```

### Scenario 5: Session Conflict

**User types: TSLA** (while AAPL session is active)

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│                                             │
│  You have an active analysis session.       │
│  Reply with:                                │
│  • "yes" to start analyzing TSLA            │
│  • Or ask a question about the current      │
│    analysis                                 │
└─────────────────────────────────────────────┘
```

**User types: yes**

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│  Analyzing TSLA...                          │
│                                             │
│  [New analysis starts...]                   │
└─────────────────────────────────────────────┘
```

### Scenario 6: Stopping an Analysis

**While analysis is running, user types: /stop**

```
┌─────────────────────────────────────────────┐
│  Stock Analyzer Bot                         │
│  ❌ Analysis stopped.                       │
└─────────────────────────────────────────────┘
```

---

## Testing Strategy

The refactor placed heavy emphasis on testing to ensure reliability.

### Test Distribution

```
┌─────────────────────────────────────────────────────────────────┐
│                  TOTAL: 112 TESTS PASSING                       │
└─────────────────────────────────────────────────────────────────┘

Session Management    ████████████████████████████████████  40 tests
Hooks Service         ███████████████████████████████      31 tests
Agent (Baseline)      █████████████████                    17 tests
Agent (Enhanced)      ████████████████████████             24 tests
```

### What We Test

#### 1. Session Management (40 tests)

```typescript
describe('SessionManagerService', () => {

  // Session Lifecycle
  ✅ Create session
  ✅ Get active session
  ✅ Complete session
  ✅ Stop session
  ✅ Expire session

  // Conversation History
  ✅ Add user message
  ✅ Add assistant message
  ✅ Build context prompt
  ✅ Include recent sessions

  // Metrics Tracking
  ✅ Track tokens
  ✅ Track tool calls
  ✅ Track turns
  ✅ Track errors

  // Automatic Cleanup
  ✅ Cleanup expired sessions
  ✅ Keep active sessions
  ✅ Timer initialization
  ✅ Timer cleanup on destroy

  // Edge Cases
  ✅ Handle missing session
  ✅ Handle duplicate creation
  ✅ Handle concurrent updates
  ✅ Handle cleanup during active use

  // ... 40 total tests
});
```

#### 2. Hooks Service (31 tests)

```typescript
describe('HooksService', () => {

  // OnMessageHook
  ✅ Track message types
  ✅ Track token usage
  ✅ Emit progress events
  ✅ Handle missing session

  // OnToolUseHook
  ✅ Validate required parameters
  ✅ Enforce budget limits
  ✅ Allow within budget
  ✅ Block when exceeded
  ✅ Track tool calls metric
  ✅ Inject session context

  // OnToolResultHook
  ✅ Filter sensitive data (apiKey)
  ✅ Filter sensitive data (password)
  ✅ Filter sensitive data (token)
  ✅ Enhance error messages
  ✅ Cache successful results
  ✅ Track error metrics

  // Budget Management
  ✅ Set budget
  ✅ Get budget
  ✅ Update budget
  ✅ Reset budget

  // Edge Cases
  ✅ Handle invalid JSON
  ✅ Handle missing budget
  ✅ Handle zero budget
  ✅ Handle negative costs

  // ... 31 total tests
});
```

#### 3. Agent Service (17 baseline + 24 enhanced = 41 tests)

```typescript
describe('AgentService - Baseline', () => {

  // Backward Compatibility
  ✅ Analyze stock (legacy signature)
  ✅ Analyze stock (new signature)
  ✅ Return analysis result
  ✅ Handle missing ticker
  ✅ Handle API errors

  // Streaming
  ✅ Stream text chunks
  ✅ Stream thinking events
  ✅ Stream tool events
  ✅ Stream complete events

  // Event Emission
  ✅ Emit analysis.chunk
  ✅ Emit analysis.thinking
  ✅ Emit analysis.tool
  ✅ Emit analysis.complete

  // ... 17 total tests
});

describe('AgentService - Enhanced', () => {

  // Conversation Mode
  ✅ Handle conversation
  ✅ Build context from session
  ✅ Add messages to history
  ✅ Throw error if no session

  // Session Integration
  ✅ Create session on analyze
  ✅ Complete session on finish
  ✅ Use provided session ID
  ✅ Generate session ID if missing

  // All 7 SDK Message Types
  ✅ Handle SDKAssistantMessage
  ✅ Handle SDKUserMessage
  ✅ Handle SDKResultMessage
  ✅ Handle SDKSystemMessage (init)
  ✅ Handle SDKSystemMessage (compact_boundary)
  ✅ Handle SDKPartialAssistantMessage
  ✅ Handle SDKUserMessageReplay

  // Hooks Integration
  ✅ Call onMessage hook
  ✅ Call onToolUse hook
  ✅ Call onToolResult hook
  ✅ Continue on hook failure

  // Error Resilience
  ✅ Handle hook errors
  ✅ Handle message processing errors
  ✅ Continue stream after errors

  // ... 24 total tests
});
```

### Test Infrastructure

We built comprehensive mocking utilities to make testing easy:

```typescript
// Mock SDK streams for testing
MockSDKStream.createAssistantMessage('Analysis text')
MockSDKStream.createThinkingMessage('Thinking...')
MockSDKStream.createToolUseMessage('fetch_data', { ticker: 'AAPL' })
MockSDKStream.createFullStream('success')

// Mock sessions for testing
MockSessionManager.createActiveSession('AAPL', 'chat123')
MockSessionManager.createExpiredSession('AAPL', 'chat123')
MockSessionManager.createSessionWithHistory('AAPL', 'chat123', messages)

// Mock Telegram for testing
MockTelegram.createContext({ message: { text: 'AAPL' } })
MockTelegram.createReplyCaptor()
```

### Why Testing Matters

**Without tests**: Making changes is scary
```
Developer: "I want to add a feature"
Developer: "But what if I break something?"
Developer: "I can't test everything manually..."
Developer: "Better not change anything" ❌
```

**With tests**: Making changes is confident
```
Developer: "I want to add a feature"
Developer: "Let me run the tests"
Test runner: "112/112 tests passing" ✅
Developer: "Great! I can safely add my feature"
Developer: "If I break something, tests will catch it"
```

---

## What Changed in the Refactor

This section documents what was changed, why, and the benefits.

### Before the Refactor

```
┌─────────────────────────────────────────────────────────────────┐
│                         OLD SYSTEM                              │
└─────────────────────────────────────────────────────────────────┘

Problems:
❌ No session management → Every request was isolated
❌ No conversation memory → Couldn't ask follow-up questions
❌ No hooks system → Validation logic mixed with business logic
❌ Limited error handling → Failures cascaded
❌ Not all SDK message types handled → Missing features
❌ No test infrastructure → Fear of making changes

User Experience:
User: "Analyze AAPL"
Bot: [Analysis]

User: "What's the P/E?"
Bot: "I don't know what you're asking about" ❌
```

### After the Refactor

```
┌─────────────────────────────────────────────────────────────────┐
│                         NEW SYSTEM                              │
└─────────────────────────────────────────────────────────────────┘

Improvements:
✅ Session management → 1-hour conversational memory
✅ Conversation mode → Natural follow-up questions
✅ Hooks system → Clean separation of concerns
✅ Robust error handling → Graceful degradation
✅ All 7 SDK message types → Complete feature set
✅ 112 tests passing → Confidence in changes

User Experience:
User: "Analyze AAPL"
Bot: [Analysis]

User: "What's the P/E?"
Bot: "AAPL's P/E is 28.5..." ✅

User: "How does that compare?"
Bot: "Compared to sector average..." ✅
```

### The Five Phases

#### Phase 1: Test Infrastructure ✅

**What**: Built comprehensive mocking utilities

**Why**: Need to test without real API calls

**Benefit**: Can run 112 tests in seconds

```
Created:
• MockSDKStream - Mock all 7 SDK message types
• MockSessionManager - Mock session data
• MockTelegram - Mock Telegram interactions
• Test fixtures - Sample financial data

Result: 17 baseline tests passing
```

#### Phase 2: Session Management ✅

**What**: Created session management library

**Why**: Enable conversational experience

**Benefit**: Users can now ask follow-up questions naturally

```
Created:
• SessionManagerService - Lifecycle management
• AnalysisSession interface - Data structure
• Automatic cleanup - 1-hour expiration
• Context building - Prompt construction

Result: 40 tests passing
```

**Impact on User Experience**:
```
BEFORE:
User: "Analyze AAPL"
[analysis]
User: "What's the P/E?"
Bot: ❌ "What company?"

AFTER:
User: "Analyze AAPL"
[analysis]
User: "What's the P/E?"
Bot: ✅ "AAPL's P/E is 28.5..."
```

#### Phase 3: Hooks System ✅

**What**: Created middleware-style hooks

**Why**: Separate cross-cutting concerns from core logic

**Benefit**: Cleaner code, easier testing, flexible control

```
Created:
• HooksService - Hook orchestration
• OnMessageHook - Track messages
• OnToolUseHook - Validate & budget control
• OnToolResultHook - Filter & enhance

Result: 31 tests passing
```

**Code Quality Impact**:
```
BEFORE (mixed concerns):
async executeTool(name, input) {
  // Validation mixed in
  if (!input.ticker) throw Error();

  // Budget check mixed in
  if (cost > limit) throw Error();

  // Core logic
  const result = await api.call(input);

  // Filtering mixed in
  delete result.apiKey;

  return result;
}

AFTER (clean separation):
async executeTool(name, input) {
  // Just core logic!
  return await api.call(input);
}

// Validation, budget, filtering in hooks
onToolUse → validate & check budget
onToolResult → filter sensitive data
```

#### Phase 4: Enhanced AgentService ✅

**What**: Integrated sessions, hooks, and all SDK message types

**Why**: Bring everything together in the core service

**Benefit**: Complete feature set with robust error handling

```
Enhanced:
• Added handleConversation() method
• Integrated SessionManager
• Integrated HooksService
• Handled all 7 SDK message types
• Improved error resilience

Result: 41 tests passing (17 baseline + 24 enhanced)
```

**Reliability Impact**:
```
BEFORE:
Hook error → Analysis fails ❌

AFTER:
Hook error → Log warning, continue analysis ✅

Example:
try {
  onMessageHook(message);
} catch (error) {
  logger.warn('Hook failed, continuing...');
  // Analysis continues!
}
```

#### Phase 5: TelegramBotService Refactor ✅

**What**: Added smart routing and conversation support

**Why**: Expose new features to users

**Benefit**: Seamless conversational experience

```
Added:
• Smart routing (commands/tickers/questions)
• /status command
• Session conflict detection
• Conversation mode support
• Enhanced completion messages

Result: Full user experience
```

**Routing Logic**:
```
User Input → Smart Detection → Route to Handler

"AAPL"              → Ticker       → Start analysis
"/status"           → Command      → Show status
"What's the P/E?"   → Question     → Conversation mode
"/stop"             → Command      → Stop analysis
```

### Backward Compatibility: Zero Breaking Changes

**Critical**: The refactor maintained 100% backward compatibility.

```
OLD CODE (still works):
await agentService.analyzeStock('AAPL', 'Analyze stock');

NEW CODE (also works):
await agentService.analyzeStock('chat123', 'AAPL', 'Analyze stock');

Both signatures work! No breaking changes!
```

**How We Did It**: Signature overload detection

```typescript
async analyzeStock(
  tickerOrChatId: string,
  userPromptOrTicker: string,
  optionsOrUserPrompt?: AnalysisOptions | string,
  sessionIdOrOptions?: string | AnalysisOptions,
  sessionId?: string
): Promise<AnalysisResult> {

  // Detect which signature is being used
  if (typeof optionsOrUserPrompt !== 'string') {
    // Legacy signature: (ticker, prompt, options?, sessionId?)
    chatId = 'default';
    ticker = tickerOrChatId;
    userPrompt = userPromptOrTicker;
  } else {
    // New signature: (chatId, ticker, prompt, options?, sessionId?)
    chatId = tickerOrChatId;
    ticker = userPromptOrTicker;
    userPrompt = optionsOrUserPrompt;
  }

  // Continue with unified logic...
}
```

### Performance Improvements

#### 1. Memory Efficiency

**Automatic Cleanup**:
```
Before: Sessions accumulate indefinitely → Memory leak
After: Sessions expire after 1 hour → Bounded memory usage

Cleanup runs every 5 minutes:
  for (session of allSessions) {
    if (now > session.expiresAt) {
      delete session;  // Free memory
    }
  }
```

#### 2. Context Optimization

**Limit Recent Sessions**:
```
Before: Could include all past sessions → Huge context
After: Only last 5 sessions → Manageable context

Context size:
  Recent sessions (5) + Current history = ~3000 tokens
  vs.
  All sessions (50+) = ~30,000 tokens
```

#### 3. Streaming Optimizations

**Throttled Updates**:
```
Before: Update Telegram for every chunk → Rate limited
After: Throttle updates (1s or 10 chunks) → Smooth experience

Impact:
  100 chunks/second with throttling:
    → ~10 Telegram updates/second ✅

  100 chunks/second without throttling:
    → Rate limited, janky experience ❌
```

### Migration Guide

**Good news**: No migration needed!

```
┌─────────────────────────────────────────────────────────────────┐
│                    MIGRATION: NONE REQUIRED                     │
└─────────────────────────────────────────────────────────────────┘

For Developers:
  • Old code continues to work
  • New features available when ready
  • No breaking changes

For Users (Telegram):
  • Same commands work
  • New commands available (/status)
  • Can now ask follow-up questions
  • Sessions auto-expire after 1 hour
```

### Future Enhancements

**Ideas for next improvements**:

```
Potential Improvements:

1. Session Persistence
   Current: In-memory (lost on restart)
   Future: Database storage (survive restarts)

2. Multi-Stock Comparison
   Current: One stock per session
   Future: Compare multiple stocks in one session

3. Export Conversation History
   Current: View only in Telegram
   Future: Export as PDF or JSON

4. Custom Budget Limits
   Current: Per-session budgets
   Future: Per-user budgets with tracking

5. Advanced Session Analytics
   Current: Basic metrics (tokens, tools, turns)
   Future: Detailed analytics dashboard
```

---

## Conclusion

The Stock Analyzer Agent is a sophisticated AI-powered system that enables natural, conversational stock analysis through Telegram.

### Key Takeaways

**For Beginners**:
1. The system has **four main layers**: Telegram Bot → Stream Manager → Agent Service → Claude AI
2. **Sessions** remember your conversations for 1 hour
3. **Hooks** control quality and enforce limits
4. **Two modes**: Workflow (new analysis) and Conversation (follow-ups)
5. Everything streams in **real-time** so you see progress

**For Developers**:
1. **112 tests** ensure reliability
2. **Zero breaking changes** maintained backward compatibility
3. **Clean architecture** with separation of concerns
4. **Robust error handling** with graceful degradation
5. **Comprehensive documentation** for maintenance

### System Strengths

✅ **Natural conversation** - Ask follow-ups like talking to a human analyst
✅ **Real-time feedback** - See analysis as it's being generated
✅ **Quality control** - Hooks enforce budgets and validation
✅ **Memory efficient** - Automatic cleanup prevents leaks
✅ **Well tested** - 112 tests provide confidence
✅ **Clean code** - Separation of concerns aids maintainability

### Final Architecture

```
YOU
 ↓
Telegram Bot (smart routing)
 ↓
Stream Manager (real-time SSE)
 ↓
Agent Service (two modes)
 ├─ Session Manager (memory)
 └─ Hooks Service (control)
 ↓
Claude AI (analysis)
 ↓
Financial APIs (data)
```

**Refactor Completed**: January 9, 2025
**Test Coverage**: 112/112 tests passing ✅
**Backward Compatibility**: 100% maintained ✅
**New Features**: 8+ major capabilities added ✅

---

*This documentation is designed to help anyone - from complete beginners to experienced developers - understand how the Stock Analyzer Agent system works. Questions? Check the code or ask!*
