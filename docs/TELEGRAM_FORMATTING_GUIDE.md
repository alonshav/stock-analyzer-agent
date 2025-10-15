# Telegram Rich Formatting Guide

## What Telegram Supports

### ✅ Supported Features

Telegram supports **HTML** and **MarkdownV2** but **NOT** GitHub-style callouts like `[!NOTE]`.

#### HTML Format (Recommended)
```html
<b>bold</b>
<i>italic</i>
<u>underline</u>
<s>strikethrough</s>
<tg-spoiler>spoiler</tg-spoiler>
<a href="url">link</a>
<code>inline code</code>
<pre>code block</pre>
<pre language="python">highlighted code</pre>
```

#### MarkdownV2 Format
```markdown
*bold*
_italic_
__underline__
~strikethrough~
||spoiler||
[link](url)
`inline code`
```language
code block
```
```

**Note**: All special characters in MarkdownV2 must be escaped: `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`

### ❌ NOT Supported

- GitHub callouts (`[!NOTE]`, `[!WARNING]`)
- Markdown headers (`#`, `##`, `###`)
- Tables (`| col |`)
- Horizontal rules (`---`)
- The blue vertical line styling
- Nested blockquotes

## Best Practices for Stock Analyzer

### 1. Use HTML for Reliability

**Why**: MarkdownV2 requires escaping every special character, which is error-prone with financial data (`, %, $, etc.)

```javascript
// Good - HTML is safe
ctx.reply(
  `<b>AAPL Analysis</b>\n` +
  `Price: <code>$175.50</code>\n` +
  `P/E: <code>28.5</code>`,
  { parse_mode: 'HTML' }
);

// Bad - MarkdownV2 requires escaping
ctx.reply(
  `*AAPL Analysis*\n` +
  `Price: \`\\$175\\.50\`\n` + // Must escape $ and .
  `P/E: \`28\\.5\``, // Must escape .
  { parse_mode: 'MarkdownV2' }
);
```

### 2. Visual Hierarchy with Emojis + Bold

```
📊 <b>STOCK ANALYSIS: AAPL</b>

<b>📈 Valuation</b>
Current Price: <code>$175.50</code>
Fair Value: <code>$195.00</code>
Upside: <code>+11.1%</code>

<b>💰 Financials (TTM)</b>
Revenue: <code>$383.9B</code>
Net Income: <code>$97.0B</code>
Free Cash Flow: <code>$99.6B</code>

<b>🎯 Recommendation</b>
<b>STRONG BUY</b> - Undervalued by 11%
```

### 3. Box Drawing for Structure

```
┌─────────────────────────────
│ <b>📊 ANALYSIS SUMMARY</b>
├─────────────────────────────
│ Ticker:    <code>AAPL</code>
│ Price:     <code>$175.50</code>
│ Target:    <code>$195.00</code>
│ Upside:    <code>+11.1%</code>
├─────────────────────────────
│ <b>Rating: STRONG BUY ⭐⭐⭐⭐⭐</b>
└─────────────────────────────
```

### 4. Progress Indicators

```
<b>📊 Fetching AAPL data...</b>

✅ Company Profile
✅ Financial Statements (8 quarters)
✅ Key Metrics
⏳ Running DCF valuation...
⏹ PDF generation pending
```

### 5. Data Tables with Monospace

```
<b>📈 Quarterly Revenue Growth</b>

<pre>
Q1 2024:  $119.6B  (+2.1%)
Q4 2023:  $119.6B  (+0.0%)
Q3 2023:  $89.5B   (-1.4%)
Q2 2023:  $94.8B   (+1.4%)
</pre>
```

### 6. Status Messages with Visual Feedback

```
✅ <b>Analysis Complete!</b>

⏱️ Duration: <code>87s</code>
🤖 Model: <code>claude-sonnet-4</code>
📊 Data Points: <code>847</code>

💬 You can now ask follow-up questions!
```

### 7. Error Messages with Clear Actions

```
⚠️ <b>Analysis Failed</b>

<b>Reason:</b> API rate limit exceeded

<b>What you can do:</b>
▪ Wait 60 seconds and try again
▪ Use /status to check session
▪ Use /new to start fresh
```

### 8. Tool Event Notifications

```
🔧 <b>Fetching AAPL Financial Data</b>

<b>Data Types:</b>
  ▪ Income Statements
  ▪ Balance Sheets
  ▪ Cash Flow Statements
  ▪ Key Metrics

<b>Period:</b> Last 8 quarters
<b>Status:</b> ⏳ In progress...
```

### 9. Session Status Display

```
📊 <b>Session Status</b>

<b>Session ID:</b> <code>chat123-1234567890</code>
<b>Status:</b> 🟢 Active
<b>Created:</b> 2025-01-15 10:30 AM

<b>📈 Workflows:</b> 2 completed
  ✅ full_analysis (AAPL) - 87s
  ✅ full_analysis (MSFT) - 92s

<b>💬 Messages:</b> 5 in conversation

<b>⏰ Session Expires:</b> In 48 minutes
```

### 10. Help Menu with Structure

```
🤖 <b>Stock Analyzer Bot</b>

<b>📊 Analysis Commands</b>
/analyze TICKER - Full stock analysis
  <i>Example: /analyze AAPL</i>

<b>💬 Conversation</b>
Ask me anything about stocks, finance, or economics!
  <i>Example: "What's a good P/E ratio?"</i>

<b>🔧 Session Management</b>
/status - View current session
/new or /reset - Start fresh session
/stop - Stop current analysis

<b>ℹ️ Help</b>
/help - Show this message
```

## Implementation Guidelines

### Parse Mode Configuration

Always specify `parse_mode` when using formatting:

```typescript
// HTML
await ctx.reply(message, { parse_mode: 'HTML' });

// MarkdownV2
await ctx.reply(message, { parse_mode: 'MarkdownV2' });

// Plain text (no formatting)
await ctx.reply(message); // or { parse_mode: undefined }
```

### Escaping Special Characters

For HTML, only escape these:
- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;`

For MarkdownV2, escape these:
- `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`

### Message Length Limits

- **Regular messages**: 4096 characters
- **Captions**: 1024 characters
- Use `sendLongMessage()` for splitting long content

## Character Reference

### Box Drawing Characters
```
┌ ─ ┐
│   │
├ ─ ┤
│   │
└ ─ ┘

╔ ═ ╗
║   ║
╠ ═ ╣
║   ║
╚ ═ ╝
```

### Bullets and Symbols
```
• ▪ ◦ ▫      (bullets)
→ ⇒ ➜ ➤     (arrows)
✓ ✔ ✅ ❌    (checkmarks)
★ ⭐ ◆ ◇    (stars/diamonds)
▲ ▼ ◀ ▶    (triangles)
⏰ ⏱️ ⏳ ⌛   (time)
📊 📈 📉 💰   (finance)
```

### Status Indicators
```
🟢 Active
🟡 Pending
🔴 Error
⚪ Inactive
⏸️ Paused
▶️ Running
⏹️ Stopped
```

## Examples for Stock Analyzer

### Analysis Complete Message
```typescript
const message = `
✅ <b>AAPL Analysis Complete!</b>

┌─────────────────────────────
│ <b>📊 VALUATION SUMMARY</b>
├─────────────────────────────
│ Current:  <code>$175.50</code>
│ Fair:     <code>$195.00</code>
│ Upside:   <code>+11.1%</code>
├─────────────────────────────
│ <b>Rating: STRONG BUY ⭐⭐⭐⭐</b>
└─────────────────────────────

⏱️ Duration: <code>87s</code>
🤖 Model: <code>claude-sonnet-4</code>

💬 Ask follow-up questions or use /new for another stock!
`.trim();

await ctx.reply(message, { parse_mode: 'HTML' });
```

### Tool Call Notification
```typescript
const message = `
🔧 <b>Fetching AAPL Financial Data</b>

<b>Data Types:</b>
  ▪ Income Statements
  ▪ Balance Sheets
  ▪ Cash Flow Statements
  ▪ Key Metrics

<b>Period:</b> Last 8 quarters (2 years)

⏳ This may take 30-60 seconds...
`.trim();

await ctx.reply(message, { parse_mode: 'HTML' });
```

### Error Message
```typescript
const message = `
⚠️ <b>Analysis Failed</b>

<b>Ticker:</b> ${ticker}
<b>Reason:</b> API rate limit exceeded

<b>What to try:</b>
▪ Wait 60 seconds and retry
▪ Use /status to check session
▪ Use /new to start fresh

Need help? Use /help
`.trim();

await ctx.reply(message, { parse_mode: 'HTML' });
```

## Migration Strategy

1. **Create HTML formatter service** - `libs/bot/telegram/src/lib/formatters/html-formatter.service.ts`
2. **Update message templates** - Use HTML formatting in `BotMessages`
3. **Add parse_mode to all replies** - Set `{ parse_mode: 'HTML' }` on all `ctx.reply()` calls
4. **Create template functions** - For complex messages (analysis complete, tool calls, etc.)
5. **Test with real data** - Ensure special characters don't break formatting

## Testing Checklist

- [ ] Messages with special characters ($, %, &, <, >)
- [ ] Long messages (3000+ chars)
- [ ] Messages with links
- [ ] Messages with code blocks
- [ ] Error messages with stack traces
- [ ] Tool call notifications with complex data
- [ ] Session status with timestamps
- [ ] Help text with nested formatting
