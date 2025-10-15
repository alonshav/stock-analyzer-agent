/**
 * BotMessages V2 - Rich HTML Formatted Messages
 *
 * Enhanced message templates using:
 * - HTML formatting (bold, code, italic)
 * - Emojis for visual emphasis
 * - Box drawing characters for structure
 * - Proper spacing and hierarchy
 *
 * All messages support HTML parse_mode.
 */

export const BotMessagesV2 = {
  // --- Session Management ---

  NEW_SESSION: `
✨ <b>New Session Started!</b>

<b>What you can do:</b>
  ▪ Ask financial questions
  ▪ Use /analyze TICKER for analysis
  ▪ Use /status to view session
  ▪ Use /help for all commands

<i>Let's analyze some stocks! 📈</i>
`.trim(),

  NEW_SESSION_FAILED: `
⚠️ <b>Failed to Start Session</b>

<b>What to try:</b>
  ▪ Try again in a moment
  ▪ Use /help for assistance

<i>If this persists, please report it.</i>
`.trim(),

  NO_ACTIVE_SESSION: `
💤 <b>No Active Session</b>

<b>To get started:</b>
  ▪ Use /new to start a conversation
  ▪ Use /analyze TICKER for analysis

<i>Example: /analyze AAPL</i>
`.trim(),

  // --- Errors ---

  GENERIC_ERROR: `
⚠️ <b>Something Went Wrong</b>

<b>What to try:</b>
  ▪ Use /new to start fresh
  ▪ Use /status to check session
  ▪ Use /help for assistance

<i>If this persists, please report it.</i>
`.trim(),

  UNABLE_TO_IDENTIFY_CHAT: `
⚠️ <b>Unable to Identify Chat</b>

Please try your command again.
`.trim(),

  ANALYSIS_FAILED: (ticker: string) => `
⚠️ <b>Analysis Failed</b>

<b>Ticker:</b> ${ticker}

<b>What to try:</b>
  ▪ Check ticker symbol is correct
  ▪ Wait a moment and try again
  ▪ Use /status to check session

<i>Need help? Use /help</i>
`.trim(),

  SESSION_STATUS_FAILED: `
⚠️ <b>Failed to Get Status</b>

<b>What to try:</b>
  ▪ Try again in a moment
  ▪ Use /new if session is stuck

<i>Use /help for assistance</i>
`.trim(),

  WAIT_FOR_RESPONSE: `
⏳ <b>Please Wait...</b>

I'm still processing your previous request.

<i>Use /stop to cancel if needed</i>
`.trim(),

  // --- Conversation ---

  CONTEXT_COMPACTED: `
🔄 <b>Context Optimized</b>

Your conversation grew large and was compacted to maintain performance.

<b>You can:</b>
  ▪ Continue chatting normally
  ▪ Use /new for a fresh start

<i>All your data is still available!</i>
`.trim(),

  CONVERSATION_FAILED: `
⚠️ <b>Conversation Failed</b>

<b>What to try:</b>
  ▪ Try your question again
  ▪ Use /new to start fresh
  ▪ Simplify your question

<i>Use /help for assistance</i>
`.trim(),

  // --- Commands ---

  ANALYZE_USAGE: `
ℹ️ <b>Usage: /analyze TICKER</b>

<b>Example:</b>
  <code>/analyze AAPL</code>

<i>Ticker must be a valid stock symbol</i>
`.trim(),

  STARTING_ANALYSIS: (ticker: string) => `
📊 <b>Starting Analysis: ${ticker}</b>

⏳ This may take 1-2 minutes...

<i>I'll notify you of each step!</i>
`.trim(),

  // --- Help ---

  HELP_TEXT: `
🤖 <b>Stock Analyzer Bot</b>

<b>📊 Analysis Commands</b>
/analyze TICKER - Full stock analysis
  <i>Example: /analyze AAPL</i>

<b>💬 Conversation</b>
Ask me anything about stocks, finance, or economics!
  <i>Example: "What's a good P/E ratio?"</i>
  <i>Example: "Compare AAPL vs MSFT"</i>

<b>🔧 Session Management</b>
/status - View current session info
/new or /reset - Start fresh session
/stop - Stop current analysis

<b>ℹ️ Help</b>
/help - Show this message

<i>💡 Tip: You can ask follow-up questions after analysis!</i>
`.trim(),

  // --- Stop Command ---

  STOPPED: `
❌ <b>Stopped</b>

Analysis has been cancelled.

<b>What's next?</b>
  ▪ Use /analyze for another stock
  ▪ Use /new to start fresh
  ▪ Ask me any question!
`.trim(),

  NOTHING_TO_STOP: `
ℹ️ <b>Nothing to Stop</b>

No active analysis or conversation is running.

<i>Use /analyze TICKER to start analysis</i>
`.trim(),

  // --- Tool Events ---

  FETCHING_DATA: (ticker: string, dataTypes: string[], period: string) => `
🔧 <b>Fetching ${ticker} Financial Data</b>

<b>Data Types:</b>
${dataTypes.map((t) => `  ▪ ${t}`).join('\n')}

<b>Period:</b> ${period}

⏳ This may take 30-60 seconds...
`.trim(),

  DATA_FETCHED: (dataTypes: string[], period: string) => `
✅ <b>Financial Data Retrieved!</b>

<b>Retrieved:</b>
${dataTypes.map((t) => `  ▪ ${t}`).join('\n')}

<b>Period:</b> ${period}

⏰ Analyzing data now...
`.trim(),

  RUNNING_DCF: (ticker: string, years: number, discountRate: number) => `
🧮 <b>Running DCF Valuation</b>

<b>Ticker:</b> ${ticker}
<b>Projection:</b> ${years} years
<b>Discount Rate:</b> ${(discountRate * 100).toFixed(1)}%

⏳ Calculating intrinsic value...
`.trim(),

  DCF_COMPLETE: (years: number, discountRate: number) => `
✅ <b>DCF Valuation Complete!</b>

<b>Parameters:</b>
  ▪ Projection: ${years} years
  ▪ Discount rate: ${(discountRate * 100).toFixed(1)}%

📊 Results included in final report
`.trim(),

  GENERATING_PDF: (ticker: string, reportType: string) => `
📄 <b>Generating PDF Report</b>

<b>Ticker:</b> ${ticker}
<b>Type:</b> ${reportType}

⏳ Creating document...
`.trim(),

  PDF_GENERATED: (reportType: string) => `
✅ <b>${reportType} PDF Generated!</b>

📨 Sending document now...
`.trim(),

  // --- Thinking ---

  THINKING: `💭 <b>Thinking...</b>`,

  // --- Session Status ---

  SESSION_INFO: (params: {
    sessionId: string;
    status: string;
    created: string;
    messageCount: number;
    workflowCount: number;
  }) => `
┌─────────────────────────────
│ <b>📊 SESSION STATUS</b>
├─────────────────────────────
│ ID:       <code>${params.sessionId.slice(0, 16)}...</code>
│ Status:   ${params.status === 'active' ? '🟢' : '⚪'} ${params.status.toUpperCase()}
│ Created:  ${params.created}
├─────────────────────────────
│ 📈 Workflows:  ${params.workflowCount}
│ 💬 Messages:   ${params.messageCount}
└─────────────────────────────

<i>Use /new to start a fresh session</i>
`.trim(),
} as const;

/**
 * Type for BotMessagesV2 with both static strings and parameterized functions
 */
export type BotMessagesV2Type = typeof BotMessagesV2;
