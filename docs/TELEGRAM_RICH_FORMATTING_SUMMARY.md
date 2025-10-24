# Telegram Rich Formatting - Complete Guide

## Executive Summary

This guide provides everything you need to create beautifully formatted Telegram messages for the Stock Analyzer bot using HTML markup, emojis, and box drawing characters.

**Key Points:**
- ✅ Telegram supports HTML and MarkdownV2
- ❌ Telegram does NOT support GitHub-style callouts (`[!NOTE]`, `[!WARNING]`)
- 🎯 HTML is recommended over MarkdownV2 (easier with financial data)
- 📦 Pre-built templates available in `BotMessagesV2` and `HTMLFormatterService`

---

## Quick Reference

### What Telegram Supports

| Feature | Supported | Format |
|---------|-----------|--------|
| Bold | ✅ | `<b>text</b>` |
| Italic | ✅ | `<i>text</i>` |
| Underline | ✅ | `<u>text</u>` |
| Strikethrough | ✅ | `<s>text</s>` |
| Code | ✅ | `<code>text</code>` |
| Code Block | ✅ | `<pre>text</pre>` |
| Links | ✅ | `<a href="url">text</a>` |
| Emojis | ✅ | Native Unicode |
| GitHub Callouts | ❌ | Not supported |
| Tables | ❌ | Not supported |
| Headers | ❌ | Not supported |

### Best Alternatives for Unsupported Features

#### GitHub Callouts → Emojis + Bold + Box Drawing
```
// GitHub (not supported)
> [!NOTE]
> Important information

// Telegram (works!)
┌─────────────────────────────
│ ℹ️ <b>NOTE</b>
├─────────────────────────────
│ Important information
└─────────────────────────────
```

#### Tables → Monospace + Alignment
```
// HTML Table (not supported)
| Metric | Value |
|--------|-------|
| P/E    | 28.5  |

// Telegram (works!)
<pre>
Metric     Value
P/E        28.5
ROE        147.4%
</pre>
```

#### Headers → Emojis + Bold
```
// Markdown (not supported)
## Financial Data

// Telegram (works!)
💰 <b>FINANCIAL DATA</b>
```

---

## Implementation

### 1. Import the Libraries

```typescript
import { BotMessagesV2 } from '@stock-analyzer/bot/common';
import { HTMLFormatterService } from '@stock-analyzer/bot/telegram';
```

### 2. Use Pre-Built Messages

```typescript
// Static messages
await ctx.reply(BotMessagesV2.NEW_SESSION, { parse_mode: 'HTML' });
await ctx.reply(BotMessagesV2.HELP_TEXT, { parse_mode: 'HTML' });

// Parameterized messages
await ctx.reply(
  BotMessagesV2.STARTING_ANALYSIS('AAPL'),
  { parse_mode: 'HTML' }
);

await ctx.reply(
  BotMessagesV2.FETCHING_DATA('AAPL', ['Income Statements'], 'Last 8 quarters'),
  { parse_mode: 'HTML' }
);
```

### 3. Use Template Functions for Complex Messages

```typescript
constructor(private readonly htmlFormatter: HTMLFormatterService) {}

// Analysis complete with summary
const message = this.htmlFormatter.formatAnalysisComplete({
  ticker: 'AAPL',
  duration: 87,
  model: 'claude-sonnet-4',
});
await ctx.reply(message, { parse_mode: 'HTML' });

// Session status with workflow history
const statusMessage = this.htmlFormatter.formatSessionStatus({
  sessionId: session.sessionId,
  status: session.status,
  createdAt: session.createdAt,
  messageCount: session.conversationHistory.length,
  workflows: session.workflows.map(wf => ({
    type: wf.workflowType,
    ticker: wf.ticker,
    completed: !!wf.completedAt,
    duration: wf.completedAt ?
      wf.completedAt.getTime() - wf.startedAt.getTime() : undefined,
  })),
});
await ctx.reply(statusMessage, { parse_mode: 'HTML' });
```

---

## Visual Design Patterns

### 1. Status Indicators with Emojis
```
🟢 Active    ✅ Success
🟡 Pending   ⏳ Loading
🔴 Error     ❌ Failed
⚪ Inactive  ⏸️ Paused
```

### 2. Box Drawing for Structure
```
┌─────────────────────────────
│ <b>SECTION TITLE</b>
├─────────────────────────────
│ Content line 1
│ Content line 2
└─────────────────────────────
```

### 3. Hierarchical Lists
```
<b>📊 Analysis Results</b>

<b>Valuation:</b>
  ▪ Current: <code>$175.50</code>
  ▪ Target: <code>$195.00</code>
  ▪ Upside: <code>+11.1%</code>

<b>Recommendation:</b>
  ⭐⭐⭐⭐ <b>STRONG BUY</b>
```

### 4. Progress Tracking
```
📊 <b>Analysis Progress</b>

✅ Company Profile
✅ Financial Statements
✅ Key Metrics
⏳ DCF Valuation
⏹ PDF Generation
```

### 5. Data Tables with Monospace
```
<b>📈 Quarterly Revenue</b>

<pre>
Q1 2024:  $119.6B  (+2.1%)
Q4 2023:  $119.6B  (+0.0%)
Q3 2023:  $89.5B   (-1.4%)
Q2 2023:  $94.8B   (+1.4%)
</pre>
```

### 6. Error Messages with Actions
```
⚠️ <b>Analysis Failed</b>

<b>Ticker:</b> AAPL
<b>Reason:</b> API rate limit exceeded

<b>What to try:</b>
▪ Wait 60 seconds and retry
▪ Use /status to check session
▪ Use /new to start fresh

<i>Use /help if you need assistance</i>
```

---

## Character Reference

### Box Drawing
```
Light Box:  ┌ ─ ┐ │ ├ ┤ └ ┘
Heavy Box:  ┏ ━ ┓ ┃ ┣ ┫ ┗ ┛
Double Box: ╔ ═ ╗ ║ ╠ ╣ ╚ ╝
```

### Bullets & Arrows
```
Bullets:  • ▪ ◦ ▫
Arrows:   → ⇒ ➜ ➤
```

### Checkmarks & Status
```
Checks:   ✓ ✔ ✅ ❌
Stars:    ★ ⭐
Shapes:   ◆ ◇ ▲ ▼
```

### Time & Finance
```
Time:     ⏰ ⏱️ ⏳ ⌛
Finance:  📊 📈 📉 💰 💵 💲
```

---

## Common Patterns

### Analysis Start
```typescript
await ctx.reply(BotMessagesV2.STARTING_ANALYSIS('AAPL'), {
  parse_mode: 'HTML'
});
```

**Output:**
```
📊 Starting Analysis: AAPL

⏳ This may take 1-2 minutes...

I'll notify you of each step!
```

### Tool Execution
```typescript
await ctx.reply(
  BotMessagesV2.FETCHING_DATA(
    'AAPL',
    ['Income Statements', 'Balance Sheets'],
    'Last 8 quarters (2 years)'
  ),
  { parse_mode: 'HTML' }
);
```

**Output:**
```
🔧 Fetching AAPL Financial Data

Data Types:
  ▪ Income Statements
  ▪ Balance Sheets

Period: Last 8 quarters (2 years)

⏳ This may take 30-60 seconds...
```

### Analysis Complete
```typescript
const message = this.htmlFormatter.formatAnalysisComplete({
  ticker: 'AAPL',
  duration: 87,
  model: 'claude-sonnet-4',
});
await ctx.reply(message, { parse_mode: 'HTML' });
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

### Valuation Summary
```typescript
const message = this.htmlFormatter.formatValuationSummary({
  ticker: 'AAPL',
  currentPrice: 175.50,
  fairValue: 195.00,
  upside: 11.1,
  rating: 'STRONG BUY ⭐⭐⭐⭐',
});
await ctx.reply(message, { parse_mode: 'HTML' });
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

---

## Best Practices

### ✅ DO

1. **Always specify parse_mode**
   ```typescript
   await ctx.reply(message, { parse_mode: 'HTML' });
   ```

2. **Use HTML for financial data**
   ```typescript
   // Good - no escaping needed
   <code>$175.50</code>
   <code>28.5%</code>
   ```

3. **Escape user input**
   ```typescript
   const ticker = this.htmlFormatter.escapeHtml(userInput);
   ```

4. **Use emojis for visual emphasis**
   ```typescript
   ✅ Success
   ⚠️ Warning
   📊 Data
   ```

5. **Structure with box drawing**
   ```typescript
   ┌─────────────────────────────
   │ <b>TITLE</b>
   └─────────────────────────────
   ```

### ❌ DON'T

1. **Don't use GitHub callouts**
   ```markdown
   ❌ [!NOTE] - not supported
   ✅ ℹ️ <b>NOTE</b> - use this instead
   ```

2. **Don't use Markdown headers**
   ```markdown
   ❌ ## Header - not supported
   ✅ 📊 <b>HEADER</b> - use this instead
   ```

3. **Don't forget parse_mode**
   ```typescript
   ❌ await ctx.reply(message);
   ✅ await ctx.reply(message, { parse_mode: 'HTML' });
   ```

4. **Don't use MarkdownV2 with financial data**
   ```typescript
   ❌ `\\$175\\.50` - too much escaping
   ✅ <code>$175.50</code> - clean
   ```

---

## Resources

### Documentation Files
- **TELEGRAM_FORMATTING_GUIDE.md** - Complete formatting reference
- **TELEGRAM_RICH_MESSAGES_EXAMPLES.md** - Usage examples and patterns
- **TELEGRAM_RICH_FORMATTING_SUMMARY.md** - This file (quick reference)

### Code Files
- **libs/bot/common/src/lib/messages-v2.ts** - Pre-built message templates
- **libs/bot/telegram/src/lib/formatters/html-formatter.service.ts** - Template functions
- **libs/bot/telegram/src/lib/formatters/tool-event-formatter.service.ts** - Tool event formatting

### Examples
```typescript
// Import
import { BotMessagesV2 } from '@stock-analyzer/bot/common';
import { HTMLFormatterService } from '@stock-analyzer/bot/telegram';

// Use static messages
await ctx.reply(BotMessagesV2.HELP_TEXT, { parse_mode: 'HTML' });

// Use dynamic templates
const message = this.htmlFormatter.formatAnalysisComplete({...});
await ctx.reply(message, { parse_mode: 'HTML' });
```

---

## Migration Checklist

- [ ] Review TELEGRAM_FORMATTING_GUIDE.md for all features
- [ ] Study examples in TELEGRAM_RICH_MESSAGES_EXAMPLES.md
- [ ] Import `BotMessagesV2` and `HTMLFormatterService`
- [ ] Replace plain text messages with HTML templates
- [ ] Add `{ parse_mode: 'HTML' }` to all `ctx.reply()` calls
- [ ] Inject `HTMLFormatterService` in constructors
- [ ] Test messages in Telegram (mobile + desktop)
- [ ] Verify special characters ($, %, &) render correctly
- [ ] Test long messages (3000+ chars)
- [ ] Update error messages with actionable steps
- [ ] Add progress indicators for long operations
- [ ] Use emojis for visual emphasis (but don't overdo it!)

---

## Testing

### Manual Testing
1. Send messages to test bot
2. Check on mobile and desktop
3. Verify formatting renders correctly
4. Test with real financial data ($, %, etc.)
5. Test edge cases (very long messages, special chars)

### Automated Testing
```typescript
describe('Message Formatting', () => {
  it('should format analysis complete message', () => {
    const message = htmlFormatter.formatAnalysisComplete({
      ticker: 'AAPL',
      duration: 87,
      model: 'claude-sonnet-4',
    });

    expect(message).toContain('<b>AAPL Analysis Complete!</b>');
    expect(message).toContain('<code>87s</code>');
  });
});
```

---

## Next Steps

1. **Review the documentation:**
   - Read TELEGRAM_FORMATTING_GUIDE.md for comprehensive details
   - Study examples in TELEGRAM_RICH_MESSAGES_EXAMPLES.md

2. **Start implementing:**
   - Begin with static messages (BotMessagesV2)
   - Move to dynamic templates (HTMLFormatterService)
   - Update error messages and tool notifications

3. **Test thoroughly:**
   - Send messages to test bot
   - Verify on mobile and desktop
   - Check with real financial data

4. **Iterate and improve:**
   - Gather user feedback
   - Refine formatting based on usage
   - Add new templates as needed

---

**Ready to create beautiful Telegram messages? Start with BotMessagesV2 and HTMLFormatterService!** 🚀
