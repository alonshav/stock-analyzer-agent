# Telegram Rich Messages - Usage Examples

## Quick Start

### Basic Usage with BotMessagesV2

```typescript
import { BotMessagesV2 } from '@stock-analyzer/bot/common';

// Simple static message
await ctx.reply(BotMessagesV2.NEW_SESSION, { parse_mode: 'HTML' });

// Parameterized message
await ctx.reply(
  BotMessagesV2.STARTING_ANALYSIS('AAPL'),
  { parse_mode: 'HTML' }
);
```

### Using HTML Formatter Service

```typescript
import { HTMLFormatterService } from './formatters/html-formatter.service';

constructor(private readonly htmlFormatter: HTMLFormatterService) {}

// Format analysis complete
const message = this.htmlFormatter.formatAnalysisComplete({
  ticker: 'AAPL',
  duration: 87,
  model: 'claude-sonnet-4',
});

await ctx.reply(message, { parse_mode: 'HTML' });
```

## Real-World Examples

### 1. Analysis Flow

#### Start Analysis
```typescript
const startMessage = BotMessagesV2.STARTING_ANALYSIS('AAPL');
await ctx.reply(startMessage, { parse_mode: 'HTML' });
```

**Output:**
```
📊 Starting Analysis: AAPL

⏳ This may take 1-2 minutes...

I'll notify you of each step!
```

#### Fetch Data Tool Call
```typescript
const fetchMessage = BotMessagesV2.FETCHING_DATA(
  'AAPL',
  ['Income Statements', 'Balance Sheets', 'Cash Flow Statements'],
  'Last 8 quarters (2 years)'
);
await ctx.reply(fetchMessage, { parse_mode: 'HTML' });
```

**Output:**
```
🔧 Fetching AAPL Financial Data

Data Types:
  ▪ Income Statements
  ▪ Balance Sheets
  ▪ Cash Flow Statements

Period: Last 8 quarters (2 years)

⏳ This may take 30-60 seconds...
```

#### Data Retrieved
```typescript
const dataMessage = BotMessagesV2.DATA_FETCHED(
  ['Income Statements', 'Balance Sheets', 'Cash Flow Statements'],
  'Last 8 quarters (2 years)'
);
await ctx.reply(dataMessage, { parse_mode: 'HTML' });
```

**Output:**
```
✅ Financial Data Retrieved!

Retrieved:
  ▪ Income Statements
  ▪ Balance Sheets
  ▪ Cash Flow Statements

Period: Last 8 quarters (2 years)

⏰ Analyzing data now...
```

#### DCF Valuation
```typescript
const dcfMessage = BotMessagesV2.RUNNING_DCF('AAPL', 5, 0.10);
await ctx.reply(dcfMessage, { parse_mode: 'HTML' });
```

**Output:**
```
🧮 Running DCF Valuation

Ticker: AAPL
Projection: 5 years
Discount Rate: 10.0%

⏳ Calculating intrinsic value...
```

#### Analysis Complete
```typescript
const completeMessage = this.htmlFormatter.formatAnalysisComplete({
  ticker: 'AAPL',
  duration: 87,
  model: 'claude-sonnet-4',
});
await ctx.reply(completeMessage, { parse_mode: 'HTML' });
```

**Output:**
```
✅ AAPL Analysis Complete!

⏱️ Duration: 87s
🤖 Model: claude-sonnet-4

💬 What's next?
  ▪ Ask follow-up questions
  ▪ Use /analyze for another stock
  ▪ Use /status to view session
```

### 2. Session Status

```typescript
const statusMessage = this.htmlFormatter.formatSessionStatus({
  sessionId: 'chat123-1234567890',
  status: 'active',
  createdAt: new Date(Date.now() - 3600000), // 1 hour ago
  messageCount: 5,
  workflows: [
    {
      type: 'full_analysis',
      ticker: 'AAPL',
      completed: true,
      duration: 87000,
    },
    {
      type: 'full_analysis',
      ticker: 'MSFT',
      completed: true,
      duration: 92000,
    },
  ],
});

await ctx.reply(statusMessage, { parse_mode: 'HTML' });
```

**Output:**
```
📊 Session Status

Session ID: chat123-1234567890
Status: 🟢 Active
Created: 1 hour ago

📈 Workflows: 2 total
  ✅ full_analysis (AAPL) - 87s
  ✅ full_analysis (MSFT) - 92s

💬 Messages: 5 in conversation
```

### 3. Error Handling

#### Analysis Failed
```typescript
const errorMessage = this.htmlFormatter.formatError({
  title: 'Analysis Failed',
  ticker: 'INVALID',
  reason: 'Invalid ticker symbol',
  actions: [
    'Check ticker symbol is correct',
    'Try a different ticker',
    'Use /help for assistance',
  ],
});

await ctx.reply(errorMessage, { parse_mode: 'HTML' });
```

**Output:**
```
⚠️ Analysis Failed

Ticker: INVALID

Reason: Invalid ticker symbol

What to try:
▪ Check ticker symbol is correct
▪ Try a different ticker
▪ Use /help for assistance

Use /help if you need assistance
```

#### API Rate Limit
```typescript
const rateLimitMessage = this.htmlFormatter.formatError({
  title: 'Rate Limit Exceeded',
  ticker: 'AAPL',
  reason: 'Too many requests to API',
  actions: [
    'Wait 60 seconds and try again',
    'Use /status to check session',
    'Use /new to start fresh',
  ],
});

await ctx.reply(rateLimitMessage, { parse_mode: 'HTML' });
```

**Output:**
```
⚠️ Rate Limit Exceeded

Ticker: AAPL

Reason: Too many requests to API

What to try:
▪ Wait 60 seconds and try again
▪ Use /status to check session
▪ Use /new to start fresh

Use /help if you need assistance
```

### 4. Progress Tracking

```typescript
const progressMessage = this.htmlFormatter.formatProgress([
  { label: 'Company Profile', status: 'done' },
  { label: 'Financial Statements', status: 'done' },
  { label: 'Key Metrics', status: 'done' },
  { label: 'DCF Valuation', status: 'active' },
  { label: 'PDF Generation', status: 'pending' },
]);

await ctx.reply(progressMessage, { parse_mode: 'HTML' });
```

**Output:**
```
📊 Analysis Progress

✅ Company Profile
✅ Financial Statements
✅ Key Metrics
⏳ DCF Valuation
⏹ PDF Generation
```

### 5. Financial Data Display

#### Data Table
```typescript
const tableMessage = this.htmlFormatter.formatDataTable({
  title: '📈 Quarterly Revenue Growth',
  rows: [
    { label: 'Q1 2024', value: '$119.6B', change: '+2.1%' },
    { label: 'Q4 2023', value: '$119.6B', change: '+0.0%' },
    { label: 'Q3 2023', value: '$89.5B', change: '-1.4%' },
    { label: 'Q2 2023', value: '$94.8B', change: '+1.4%' },
  ],
});

await ctx.reply(tableMessage, { parse_mode: 'HTML' });
```

**Output:**
```
📈 Quarterly Revenue Growth

Q1 2024  $119.6B  (+2.1%)
Q4 2023  $119.6B  (+0.0%)
Q3 2023  $89.5B   (-1.4%)
Q2 2023  $94.8B   (+1.4%)
```

#### Key Metrics
```typescript
const metricsMessage = this.htmlFormatter.formatMetrics({
  ticker: 'AAPL',
  metrics: {
    peRatio: '28.5',
    priceToBook: '45.2',
    dividendYield: '0.5%',
    roe: '147.4%',
    debtToEquity: '1.97',
  },
});

await ctx.reply(metricsMessage, { parse_mode: 'HTML' });
```

**Output:**
```
💰 AAPL Key Metrics

Pe Ratio: 28.5
Price To Book: 45.2
Dividend Yield: 0.5%
Roe: 147.4%
Debt To Equity: 1.97
```

### 6. Valuation Summary Box

```typescript
const valuationMessage = this.htmlFormatter.formatValuationSummary({
  ticker: 'AAPL',
  currentPrice: 175.50,
  fairValue: 195.00,
  upside: 11.1,
  rating: 'STRONG BUY ⭐⭐⭐⭐',
});

await ctx.reply(valuationMessage, { parse_mode: 'HTML' });
```

**Output:**
```
┌─────────────────────────────
│ 📊 VALUATION: AAPL
├─────────────────────────────
│ Current:  $175.50
│ Fair:     $195.00
│ Upside:   +11.1%
├─────────────────────────────
│ Rating: STRONG BUY ⭐⭐⭐⭐
└─────────────────────────────
```

## Integration with StreamManagerService

### Before (Plain Text)
```typescript
await ctx.reply(`✅ Analysis complete!\n\n⏱️ Duration: ${duration}s\n🤖 Model: ${model}`);
```

### After (Rich HTML)
```typescript
const message = this.htmlFormatter.formatAnalysisComplete({
  ticker,
  duration,
  model,
});
await ctx.reply(message, { parse_mode: 'HTML' });
```

### Workflow Event Handler Example
```typescript
// Handle COMPLETE event
client.on(StreamEventType.COMPLETE, async (data) => {
  const duration = Math.round(data.metadata.duration / 1000);

  // Rich formatted message
  const message = this.htmlFormatter.formatAnalysisComplete({
    ticker,
    duration,
    model: data.metadata.model,
  });

  await ctx.reply(message, { parse_mode: 'HTML' });

  this.stopResponding(chatId);
  this.cleanup(chatId);
});
```

### Tool Event Handler Example
```typescript
// Handle TOOL event
client.on(StreamEventType.TOOL, async (data) => {
  let message: string;

  if (isToolName(data.toolName, ToolName.FETCH_COMPANY_DATA)) {
    const input = data.toolInput || {};
    const dataTypes = (input['dataTypes'] as string[]) || [];
    const period = (input['period'] as string) || 'quarterly';

    message = BotMessagesV2.FETCHING_DATA(ticker, dataTypes, period);
  } else {
    message = this.htmlFormatter.formatToolCall({
      toolName: this.cleanToolName(data.toolName),
      ticker,
    });
  }

  await ctx.reply(message, { parse_mode: 'HTML' });
});
```

## Best Practices

### 1. Always Use HTML Parse Mode
```typescript
// ✅ Good
await ctx.reply(message, { parse_mode: 'HTML' });

// ❌ Bad - formatting won't work
await ctx.reply(message);
```

### 2. Escape User Input
```typescript
import { HTMLFormatterService } from './formatters/html-formatter.service';

// User provides ticker
const ticker = this.htmlFormatter.escapeHtml(userInput);
const message = BotMessagesV2.STARTING_ANALYSIS(ticker);
```

### 3. Use Template Functions for Complex Messages
```typescript
// ✅ Good - reusable, consistent
const message = this.htmlFormatter.formatError({
  title: 'Analysis Failed',
  ticker,
  reason: error.message,
  actions: ['Try again', 'Use /help'],
});

// ❌ Bad - hard to maintain
const message = `⚠️ Analysis Failed\n\nTicker: ${ticker}\n...`;
```

### 4. Combine Static and Dynamic Messages
```typescript
// Static message for common cases
await ctx.reply(BotMessagesV2.HELP_TEXT, { parse_mode: 'HTML' });

// Dynamic message for custom data
const statusMessage = this.htmlFormatter.formatSessionStatus({...});
await ctx.reply(statusMessage, { parse_mode: 'HTML' });
```

### 5. Handle Long Messages
```typescript
// Use TelegramFormatterService for long content
await this.telegramFormatter.sendLongMessage(ctx, content, true);

// Set parse_mode in TelegramFormatterService
private readonly parseMode = 'HTML';
```

## Testing Your Messages

### Test with Real Telegram

1. Send to your test bot
2. Check rendering on mobile and desktop
3. Verify special characters ($, %, &) display correctly
4. Test with very long content (3000+ chars)

### Common Issues

**Issue**: Message not formatted
**Solution**: Add `{ parse_mode: 'HTML' }`

**Issue**: Special characters break formatting
**Solution**: Use `htmlFormatter.escapeHtml()` on user input

**Issue**: Message too long
**Solution**: Use `telegramFormatter.sendLongMessage()`

## Migration Checklist

- [ ] Update imports to use `BotMessagesV2`
- [ ] Add `{ parse_mode: 'HTML' }` to all `ctx.reply()` calls
- [ ] Replace plain text messages with template functions
- [ ] Inject `HTMLFormatterService` in constructors
- [ ] Test all message types in Telegram
- [ ] Update error messages with actionable steps
- [ ] Add progress indicators for long operations
- [ ] Use box drawing for structured data
- [ ] Add emojis for visual emphasis (but don't overdo it!)
