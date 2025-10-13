# Bot Integration with Streaming Workflow Endpoint

## Correct Architecture

**Bot POSTs to /api/workflow and receives SSE stream directly in the same request.**

No separate GET /api/stream/:sessionId needed - the POST returns the stream!

## Bot Implementation Example

```typescript
// libs/bot/telegram/src/lib/stream-manager.service.ts

async startStream(config: StreamConfig): Promise<void> {
  const { chatId, ticker, ctx } = config;
  const session = this.sessionOrchestrator.getActiveSession(chatId);

  if (!session) {
    throw new Error('No active session');
  }

  // POST to /api/workflow with body (NOT GET!)
  // The POST response IS the SSE stream
  const streamUrl = `${agentUrl}/api/workflow`;

  const eventSource = new EventSource(streamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      sessionId: session.sessionId,
      workflowType: 'full_analysis',
      params: {
        ticker,
        userPrompt: 'Perform comprehensive analysis',
      },
    }),
  });

  this.activeStreams.set(chatId, eventSource);

  // Process SSE events as usual
  eventSource.onmessage = async (event: MessageEvent) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'connected':
        this.logger.log(`Connected to workflow stream for ${ticker}`);
        break;
      case 'chunk':
        await this.sendLongMessage(ctx, data.content, true);
        break;
      case 'tool':
        await ctx.reply(this.formatToolCall(data));
        break;
      case 'pdf':
        await this.sendPDF(ctx, data);
        break;
      case 'complete':
        this.sessionOrchestrator.completeSession(
          chatId,
          data.fullAnalysis || '',
          this.streamBuffer.get(chatId) || ''
        );
        await ctx.reply('✅ Analysis complete! Ask follow-up questions.');
        this.cleanup(chatId);
        break;
      case 'error':
        await ctx.reply(`❌ Error: ${data.message}`);
        this.cleanup(chatId);
        break;
    }
  };

  eventSource.onerror = async (error: any) => {
    this.logger.error('SSE error:', error);
    if (eventSource.readyState === EventSource.CLOSED) {
      await ctx.reply('❌ Connection lost.');
      this.cleanup(chatId);
    }
  };
}
```

## Key Points

1. **Single HTTP Request**: POST /api/workflow returns SSE stream directly
2. **No Fire-and-Forget**: The POST doesn't return immediately - it streams results
3. **EventSource with POST**: Use EventSource library that supports POST with body
4. **Bot Creates Session First**: Bot calls `sessionOrchestrator.createSession()` before POSTing
5. **Bot Manages Lifecycle**: Bot calls `sessionOrchestrator.completeSession()` on complete event

## EventSource Library Note

Standard browser EventSource doesn't support POST. For Node.js, use `eventsource` package which DOES support POST with body via options object.

```typescript
import { EventSource } from 'eventsource';

// This works in Node.js with 'eventsource' package
const eventSource = new EventSource(url, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ ... }),
});
```

## Migration from Old Architecture

**OLD (separate calls)**:
```typescript
// 1. POST /api/workflow (returns immediately)
await httpService.post('/api/workflow', { sessionId, ... });

// 2. GET /api/stream/:sessionId (establish SSE)
const eventSource = new EventSource('/api/stream/' + sessionId);
```

**NEW (single streaming POST)**:
```typescript
// Single call - POST returns SSE stream
const eventSource = new EventSource('/api/workflow', {
  method: 'POST',
  body: JSON.stringify({ sessionId, workflowType, params }),
});
```

## Benefits

✅ Simpler flow (one HTTP request instead of two)
✅ No race condition between POST completing and SSE connecting
✅ Cleaner API design (workflows stream results)
✅ Better error handling (connection failures immediate)
