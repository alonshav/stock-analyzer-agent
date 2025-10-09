# Complete Agent SDK Streaming Implementation

## Leveraging All Message Types and Hooks

-----

## Quick Reference: Message Types vs Hooks

### Message Types (What You Receive)

- **You iterate through these** in the stream
- **Read-only**: Observe but don’t modify
- **Use for**: UI updates, logging, metrics
- **Types**: `assistant`, `tool_use`, `tool_result`, `error`, `thinking`

### Hooks (What You Control)

- **Callbacks you provide** to `query()`
- **Can observe, modify, or block** execution
- **Use for**: Security, caching, enrichment, validation
- **Types**: `onMessage`, `onToolUse`, `onToolResult`

### Think of it like this:

- **Message Types** = Reading the stream (observer)
- **Hooks** = Intercepting the stream (middleware)

-----

## Part 1: What Are Hooks?

### Overview

**Hooks** are callback functions you provide to the SDK’s `query()` function. They let you intercept and customize behavior at key points in the agent’s execution lifecycle.

Think of hooks like **middleware** - they run at specific moments and can:

- 👀 **Observe** what’s happening (logging, monitoring)
- ✏️ **Modify** data (transform tool inputs/outputs)
- 🚫 **Block** actions (prevent certain tools from running)
- ⚡ **Add side effects** (emit events, update UI)

### Available Hooks

#### 1. `onMessage(message: SDKMessage)`

**When it runs:** Called for EVERY message in the stream

**Can it modify?** No (read-only)

**Use for:**

- Logging all activity
- Collecting metrics
- Real-time UI updates
- Progress tracking

**Example:**

```typescript
onMessage: (message) => {
  console.log('Message:', message.type);
  trackMetrics(message);
  updateUI(message);
}
```

-----

#### 2. `onToolUse(toolUse: ToolUseMessage)`

**When it runs:** Called BEFORE a tool executes

**Can it modify?** Yes - can modify input or block execution

**Use for:**

- Validation (check parameters)
- Security (block unauthorized tools)
- Cost control (prevent expensive operations)
- Injection (add auth tokens, context)

**Example:**

```typescript
onToolUse: (toolUse) => {
  // Block expensive tools if budget exceeded
  if (isExpensive(toolUse.name) && budgetExceeded()) {
    throw new Error('Budget exceeded');
  }
  
  // Add API key to input
  return {
    ...toolUse,
    input: {
      ...toolUse.input,
      apiKey: process.env.API_KEY
    }
  };
}
```

-----

#### 3. `onToolResult(result: ToolResultMessage)`

**When it runs:** Called AFTER a tool executes

**Can it modify?** Yes - can transform result before Claude sees it

**Use for:**

- Filtering sensitive data
- Result transformation
- Caching responses
- Error enhancement

**Example:**

```typescript
onToolResult: (result) => {
  // Remove sensitive data
  const filtered = removeSensitiveData(result.content);
  
  return {
    ...result,
    content: filtered
  };
}
```

-----

### Complete Hook Example

```typescript
const stream = query(prompt, {
  systemPrompt: '...',
  tools: myTools,
  
  // Hook 1: Log everything
  onMessage: (message) => {
    logger.log('Message:', message.type);
  },
  
  // Hook 2: Control tool execution
  onToolUse: (toolUse) => {
    // Validate and enhance
    validateInput(toolUse.input);
    return enhanceWithAuth(toolUse);
  },
  
  // Hook 3: Transform results
  onToolResult: (result) => {
    return filterAndFormat(result);
  }
});
```

-----

## Part 2: SDK Message Types Reference

All message types you’ll receive when iterating through the stream:

### 1. `assistant` - Full Assistant Turn

```typescript
{
  type: 'assistant',
  content: [
    { type: 'text', text: 'Here is the analysis...' },
    { type: 'tool_use', id: 'xyz', name: 'fetch_data', input: {...} }
  ],
  id: 'msg_123',
  stop_reason: 'tool_use',
  usage: {
    input_tokens: 1200,
    output_tokens: 450
  }
}
```

**Contains:** Text blocks and/or tool use blocks

**When you see it:** After each turn of Claude’s thinking

**Use for:** Extracting text content, detecting tool calls, tracking tokens

-----

### 2. `tool_use` - Tool Execution Request

```typescript
{
  type: 'tool_use',
  id: 'toolu_xyz',
  name: 'fetch_company_data',
  input: {
    ticker: 'AAPL'
  }
}
```

**When you see it:** When Claude wants to use a tool

**Use for:** Tracking which tools are called, logging tool usage

**Note:** Also appears inside `assistant` message’s content array

-----

### 3. `tool_result` - Tool Execution Result

```typescript
{
  type: 'tool_result',
  tool_use_id: 'toolu_xyz',
  content: '{"revenue": 394000000000, ...}',
  is_error: false
}
```

**When you see it:** After a tool completes execution

**Use for:** Tracking tool success/failure, measuring duration

-----

### 4. `error` - Error Occurred

```typescript
{
  type: 'error',
  error: {
    type: 'api_error',
    message: 'Rate limit exceeded'
  }
}
```

**When you see it:** When something goes wrong

**Use for:** Error handling, user notifications, retries

-----

### 5. `thinking` - Internal Reasoning

```typescript
{
  type: 'thinking',
  content: 'I need to fetch the company data first...'
}
```

**When you see it:** Only if extended thinking is enabled

**Use for:** Debugging, transparency, showing reasoning to users

**Note:** Optional feature, requires explicit enabling

-----

## Part 3: Streaming Events We Emit

We transform SDK messages into granular events for our clients.

### Event Types

#### `text_chunk` - Real-time Text

```typescript
{
  type: 'text_chunk',
  content: 'The company shows...',
  sessionId: 'abc-123',
  ticker: 'AAPL',
  phase: 'full-analysis',
  messageId: 'msg_xyz',
  timestamp: '2025-01-15T10:30:00Z'
}
```

**Sent when:** Claude generates text

**Client shows:** Update analysis text in real-time

-----

#### `tool_call` - Tool Started

```typescript
{
  type: 'tool_call',
  toolId: 'toolu_xyz',
  toolName: 'fetch_company_data',
  toolInput: { ticker: 'AAPL' },
  sessionId: 'abc-123',
  ticker: 'AAPL',
  phase: 'full-analysis',
  timestamp: '2025-01-15T10:30:05Z'
}
```

**Sent when:** Tool execution begins

**Client shows:** “🔧 Using tool: fetch_company_data…”

-----

#### `tool_result` - Tool Completed

```typescript
{
  type: 'tool_result',
  toolId: 'toolu_xyz',
  toolName: 'fetch_company_data',
  result: '{"revenue": ...}',
  isError: false,
  duration: 243,
  sessionId: 'abc-123',
  ticker: 'AAPL',
  phase: 'full-analysis',
  timestamp: '2025-01-15T10:30:05Z'
}
```

**Sent when:** Tool execution finishes

**Client shows:** “✅ fetch_company_data (243ms)”

-----

#### `thinking` - Reasoning Process

```typescript
{
  type: 'thinking',
  content: 'I should fetch the financial data first...',
  sessionId: 'abc-123',
  ticker: 'AAPL',
  phase: 'full-analysis',
  timestamp: '2025-01-15T10:30:00Z'
}
```

**Sent when:** Extended thinking is enabled

**Client shows:** Reasoning sidebar (optional)

-----

#### `turn_complete` - Turn Finished

```typescript
{
  type: 'turn_complete',
  stopReason: 'tool_use',
  inputTokens: 1200,
  outputTokens: 450,
  sessionId: 'abc-123',
  ticker: 'AAPL',
  phase: 'full-analysis',
  timestamp: '2025-01-15T10:30:06Z'
}
```

**Sent when:** Claude completes a turn

**Client shows:** Token usage stats

-----

#### `phase_transition` - Phase Changed

```typescript
{
  type: 'phase_transition',
  fromPhase: 'full-analysis',
  toPhase: 'executive-summary',
  sessionId: 'abc-123',
  ticker: 'AAPL',
  timestamp: '2025-01-15T10:32:00Z'
}
```

**Sent when:** Moving between analysis phases

**Client shows:** “📝 Creating summary…”

-----

#### `error` - Error Occurred

```typescript
{
  type: 'error',
  error: {
    type: 'api_error',
    message: 'Rate limit exceeded',
    stack: '...'
  },
  recoverable: true,
  sessionId: 'abc-123',
  ticker: 'AAPL',
  phase: 'full-analysis',
  timestamp: '2025-01-15T10:30:10Z'
}
```

**Sent when:** Something goes wrong

**Client shows:** Error notification

-----

#### `complete` - Analysis Done

```typescript
{
  type: 'complete',
  fullAnalysis: '...',
  executiveSummary: '...',
  metadata: {
    totalTokens: 15000,
    duration: 45000,
    toolCallsCount: 8
  },
  sessionId: 'abc-123',
  ticker: 'AAPL',
  phase: 'full-analysis',
  timestamp: '2025-01-15T10:32:45Z'
}
```

**Sent when:** Analysis completes

**Client shows:** Final results + stats

-----

## Part 4: Implementing Hooks

### The HooksService

Create a dedicated service to manage all hooks:

```typescript
@Injectable()
export class HooksService {
  
  // Hook 1: onMessage - Observe everything
  createOnMessageHook(sessionId: string, ticker: string, phase: string) {
    return (message: SDKMessage) => {
      // Log for debugging
      logger.debug(`[${sessionId}] Message: ${message.type}`);
      
      // Track token usage
      if (message.type === 'assistant' && message.usage) {
        this.trackTokens(message.usage);
      }
      
      // Emit progress event
      this.eventEmitter.emit(`stream.progress.${sessionId}`, {
        messageType: message.type,
        timestamp: new Date().toISOString(),
      });
    };
  }
  
  // Hook 2: onToolUse - Control execution
  createOnToolUseHook(sessionId: string, ticker: string, phase: string) {
    return (toolUse: ToolUseMessage) => {
      // SECURITY: Block certain tools
      if (this.shouldBlockTool(toolUse.name, phase)) {
        throw new Error(`Tool ${toolUse.name} not allowed in ${phase}`);
      }
      
      // COST CONTROL: Check budget
      if (this.isExpensive(toolUse.name)) {
        const budget = this.getRemainingBudget(sessionId);
        if (budget <= 0) {
          throw new Error('API budget exceeded');
        }
      }
      
      // VALIDATION: Check inputs
      this.validateToolInput(toolUse.name, toolUse.input);
      
      // INJECTION: Add context
      return {
        ...toolUse,
        input: {
          ...toolUse.input,
          sessionId,
          ticker,
          apiKey: this.getApiKeyForTool(toolUse.name),
        }
      };
    };
  }
  
  // Hook 3: onToolResult - Transform results
  createOnToolResultHook(sessionId: string, ticker: string, phase: string) {
    return (result: ToolResultMessage) => {
      // ERROR HANDLING: Enhance errors
      if (result.is_error) {
        return {
          ...result,
          content: this.enhanceError(result.content)
        };
      }
      
      // FILTERING: Remove sensitive data
      let content = this.removeSensitiveData(result.content);
      
      // TRANSFORMATION: Format for Claude
      content = this.formatForClaude(content);
      
      // CACHING: Store result
      this.cacheResult(result.tool_use_id, content);
      
      return {
        ...result,
        content
      };
    };
  }
}
```

-----

## Part 5: Practical Hook Examples

### Example 1: Budget Tracker

**Problem:** API calls cost money, need to limit spending per session

**Solution:**

```typescript
class BudgetTracker {
  private budgets = new Map<string, {
    limit: number;
    used: number;
  }>();
  
  createBudgetControlHook(sessionId: string) {
    return (toolUse: ToolUseMessage) => {
      const budget = this.budgets.get(sessionId);
      const cost = this.getToolCost(toolUse.name);
      
      // Check if we'd exceed budget
      if (budget.used + cost > budget.limit) {
        throw new Error(
          `Budget exceeded: ${budget.used}/${budget.limit} used`
        );
      }
      
      // Deduct cost
      budget.used += cost;
      
      return toolUse;
    };
  }
  
  private getToolCost(toolName: string): number {
    const costs = {
      fetch_company_data: 0.01,
      fetch_market_data: 0.02,
      generate_pdf: 0.05,
    };
    return costs[toolName] || 0;
  }
}
```

-----

### Example 2: Security & Access Control

**Problem:** Not all users should access all tools

**Solution:**

```typescript
class SecurityHooks {
  private permissions = new Map<string, Set<string>>();
  
  createSecurityHook(userId: string) {
    return (toolUse: ToolUseMessage) => {
      const allowed = this.permissions.get(userId);
      
      // Check permission
      if (allowed && !allowed.has(toolUse.name)) {
        throw new Error(
          `Access denied: No permission for ${toolUse.name}`
        );
      }
      
      // Block competitor data
      if (toolUse.name === 'fetch_company_data') {
        if (this.isCompetitor(toolUse.input.ticker)) {
          throw new Error('Cannot access competitor data');
        }
      }
      
      return toolUse;
    };
  }
}
```

-----

### Example 3: Smart Caching

**Problem:** Same data fetched multiple times wastes money

**Solution:**

```typescript
class CachingHooks {
  private cache = new Map<string, {
    result: string;
    timestamp: number;
    ttl: number;
  }>();
  
  createCachingHooks() {
    return {
      onToolUse: (toolUse: ToolUseMessage) => {
        const cacheKey = this.getCacheKey(toolUse);
        const cached = this.cache.get(cacheKey);
        
        // Return cached if not expired
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
          throw new CacheHitError(cached.result);
        }
        
        return toolUse;
      },
      
      onToolResult: (result: ToolResultMessage) => {
        if (!result.is_error) {
          this.cacheResult(result);
        }
        return result;
      }
    };
  }
}
```

-----

### Example 4: Analytics & Monitoring

**Problem:** Need to track performance and usage

**Solution:**

```typescript
class AnalyticsHooks {
  private toolStartTimes = new Map<string, number>();
  
  createAnalyticsHooks(sessionId: string) {
    return {
      onToolUse: (toolUse: ToolUseMessage) => {
        // Track start time
        this.toolStartTimes.set(toolUse.id, Date.now());
        return toolUse;
      },
      
      onToolResult: (result: ToolResultMessage) => {
        // Calculate duration
        const start = this.toolStartTimes.get(result.tool_use_id);
        const duration = start ? Date.now() - start : 0;
        
        // Send to analytics
        this.sendToAnalytics({
          event: 'tool_execution',
          sessionId,
          toolName: this.getToolName(result.tool_use_id),
          duration,
          success: !result.is_error,
        });
        
        return result;
      }
    };
  }
}
```

-----

### Example 5: Data Transformation

**Problem:** Tool results need formatting for Claude

**Solution:**

```typescript
class DataTransformationHooks {
  createTransformationHooks() {
    return {
      onToolUse: (toolUse: ToolUseMessage) => {
        // Normalize inputs
        let input = { ...toolUse.input };
        
        if (input.ticker) {
          input.ticker = input.ticker.toUpperCase().trim();
        }
        
        if (input.date) {
          input.date = this.normalizeDate(input.date);
        }
        
        return { ...toolUse, input };
      },
      
      onToolResult: (result: ToolResultMessage) => {
        if (result.is_error) return result;
        
        // Parse and enrich
        const data = JSON.parse(result.content);
        const enriched = {
          data,
          metadata: {
            retrievedAt: new Date().toISOString(),
            quality: this.assessQuality(data),
          }
        };
        
        return {
          ...result,
          content: JSON.stringify(enriched)
        };
      }
    };
  }
}
```

-----

## Part 6: Combining Multiple Hooks

### Composite Pattern

Chain multiple hooks together:

```typescript
class CompositeHooksService {
  createCompositeToolUseHook(sessionId: string, userId: string) {
    return (toolUse: ToolUseMessage) => {
      let result = toolUse;
      
      // Run hooks in order
      result = this.securityHook(userId)(result);
      result = this.budgetHook(sessionId)(result);
      result = this.cachingHook()(result);
      result = this.transformHook()(result);
      
      return result;
    };
  }
}
```

### Pipeline Pattern

Build composable hook chains:

```typescript
class HookPipeline {
  private hooks: Array<Hook> = [];
  
  add(hook: Hook) {
    this.hooks.push(hook);
    return this; // Chainable
  }
  
  build() {
    return (input: any) => {
      return this.hooks.reduce(
        (current, hook) => hook(current),
        input
      );
    };
  }
}

// Usage:
const pipeline = new HookPipeline()
  .add(securityCheck)
  .add(budgetCheck)
  .add(cacheCheck)
  .add(transform);

const stream = query(prompt, {
  tools: myTools,
  onToolUse: pipeline.build()
});
```

-----

## Part 7: Integration with Agent Service

### Enhanced Agent with Hooks

```typescript
@Injectable()
export class EnhancedAgentService {
  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private hooksService: HooksService
  ) {}
  
  async analyzeStock(chatId: string, ticker: string, sessionId: string) {
    // Create stream with hooks
    const stream = query(prompt, {
      systemPrompt: STOCK_VALUATION_FRAMEWORK,
      model: 'claude-sonnet-4-20250514',
      maxTokens: 16000,
      tools: this.tools,
      
      // Add all hooks
      onMessage: this.hooksService.createOnMessageHook(
        sessionId, ticker, phase
      ),
      onToolUse: this.hooksService.createOnToolUseHook(
        sessionId, ticker, phase
      ),
      onToolResult: this.hooksService.createOnToolResultHook(
        sessionId, ticker, phase
      ),
    });
    
    // Process stream and emit events
    for await (const message of stream) {
      // Handle each message type
      this.handleMessage(message, sessionId, ticker);
    }
  }
  
  private handleMessage(message: SDKMessage, sessionId: string, ticker: string) {
    switch (message.type) {
      case 'assistant':
        this.handleAssistantMessage(message, sessionId, ticker);
        break;
      case 'tool_use':
        this.emitToolCall(message, sessionId, ticker);
        break;
      case 'tool_result':
        this.emitToolResult(message, sessionId, ticker);
        break;
      case 'error':
        this.emitError(message, sessionId, ticker);
        break;
    }
  }
}
```

-----

## Part 8: SSE Controller Updates

Subscribe to all event types:

```typescript
@Controller('api/analyze')
export class EnhancedSSEController {
  
  @Get(':ticker/stream')
  async streamAnalysis(
    @Param('ticker') ticker: string,
    @Res() res: Response
  ) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Start analysis
    const streamId = await this.streamService.start(ticker);
    
    // Subscribe to ALL events
    this.eventEmitter.on(`stream.text.${streamId}`, (e) => 
      this.sendSSE(res, e)
    );
    this.eventEmitter.on(`stream.tool_call.${streamId}`, (e) => 
      this.sendSSE(res, e)
    );
    this.eventEmitter.on(`stream.tool_result.${streamId}`, (e) => 
      this.sendSSE(res, e)
    );
    this.eventEmitter.on(`stream.complete.${streamId}`, (e) => {
      this.sendSSE(res, e);
      res.end();
    });
  }
  
  private sendSSE(res: Response, data: any) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
```

-----

## Part 9: Client-Side Example

React hook consuming the enhanced stream:

```typescript
function useStockAnalysisStream(ticker: string) {
  const [text, setText] = useState('');
  const [toolCalls, setToolCalls] = useState([]);
  const [phase, setPhase] = useState('');
  const [stats, setStats] = useState({ tokens: 0, duration: 0 });
  
  useEffect(() => {
    const eventSource = new EventSource(
      `/api/analyze/${ticker}/stream`
    );
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'text_chunk':
          setText(prev => prev + data.content);
          break;
          
        case 'tool_call':
          setToolCalls(prev => [...prev, data]);
          break;
          
        case 'tool_result':
          setToolCalls(prev => prev.map(tc => 
            tc.toolId === data.toolId 
              ? { ...tc, result: data.result, duration: data.duration }
              : tc
          ));
          break;
          
        case 'phase_transition':
          setPhase(data.toPhase);
          break;
          
        case 'complete':
          setStats({
            tokens: data.metadata.totalTokens,
            duration: data.metadata.duration
          });
          eventSource.close();
          break;
      }
    };
    
    return () => eventSource.close();
  }, [ticker]);
  
  return { text, toolCalls, phase, stats };
}
```

-----

## Configuration

### Environment Variables

```bash
# Enable thinking/reasoning stream
STREAM_THINKING=false

# Message update throttle (ms)
UPDATE_THROTTLE=1000

# Extended thinking budget (tokens)
THINKING_BUDGET=5000

# Enable hooks
ENABLE_SECURITY_HOOKS=true
ENABLE_BUDGET_HOOKS=true
ENABLE_CACHING_HOOKS=true
```

-----

## Summary

### What We Achieve

✅ **Hooks - Powerful Interception**

- `onMessage`: Log, track metrics, emit progress
- `onToolUse`: Validate, control costs, add auth, block tools
- `onToolResult`: Filter data, transform results, cache

✅ **All SDK Message Types**

- Text (streamed)
- Tool use (tracked)
- Tool result (tracked with duration)
- Thinking (optional)
- Error (handled gracefully)

✅ **Granular Events**

- Text chunks (real-time)
- Tool calls (with inputs)
- Tool results (with duration)
- Turn complete (token usage)
- Phase transitions
- Errors (with recovery)
- Complete (final results)

✅ **Multiple Consumers**

- SSE controller (web)
- Telegram bot
- Future: Discord, Slack

✅ **Advanced Capabilities**

- Budget tracking
- Security & access control
- Smart caching
- Analytics & monitoring
- Data transformation

✅ **Smooth UX**

- Throttled updates
- Progress indicators
- Tool visibility
- Error recovery

### Key Insights

**Hooks are middleware:**

- Intercept at key points
- Can observe, modify, or block
- Stack multiple hooks
- Order matters

**Message Types vs Hooks:**

- **Message Types**: What you iterate (read-only)
- **Hooks**: What you provide (can modify)

**Real-World Uses:**

- 🔒 Security: Block unauthorized tools
- 💰 Cost: Track and limit spending
- ⚡ Performance: Cache operations
- 📊 Observability: Track metrics
- 🔧 Enhancement: Enrich data

-----

## Implementation Checklist

- [ ] Create `HooksService` in `libs/agent/core`
- [ ] Implement all 3 hooks: `onMessage`, `onToolUse`, `onToolResult`
- [ ] Add hook examples: Budget, Security, Caching, Analytics
- [ ] Update `AgentService` to use hooks
- [ ] Emit all 8 event types from agent
- [ ] Update SSE controller to forward all events
- [ ] Update Telegram bot to show granular progress
- [ ] Test all message types and hooks
- [ ] Configure environment variables
- [ ] Deploy and monitor