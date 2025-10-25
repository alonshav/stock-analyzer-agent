/**
 * Type definition for bot messages
 * Supports both static strings and parameterized message functions
 */
export interface BotMessagesType {
  // Session management
  NEW_SESSION: string;
  NEW_SESSION_FAILED: string;
  NO_ACTIVE_SESSION: string;

  // Errors
  GENERIC_ERROR: string;
  UNABLE_TO_IDENTIFY_CHAT: string;
  ANALYSIS_FAILED: (ticker: string) => string;
  SESSION_STATUS_FAILED: string;
  WAIT_FOR_RESPONSE: string;

  // Conversation
  CONTEXT_COMPACTED: string;
  CONVERSATION_FAILED: string;

  // Commands
  ANALYZE_USAGE: string;
  STARTING_ANALYSIS: (ticker: string) => string;

  // New workflow commands
  EARNINGS_USAGE: string;
  STARTING_EARNINGS_ANALYSIS: (ticker: string, quarter?: string) => string;
  EARNINGS_ANALYSIS_FAILED: (ticker: string) => string;

  EARNINGS_SUMMARY_USAGE: string;
  EARNINGS_SUMMARY_FAILED: (ticker: string) => string;

  SENTIMENT_USAGE: string;
  STARTING_SENTIMENT_ANALYSIS: (ticker: string) => string;
  SENTIMENT_ANALYSIS_FAILED: (ticker: string) => string;

  NEWS_USAGE: string;
  STARTING_NEWS_ANALYSIS: (ticker: string) => string;
  NEWS_ANALYSIS_FAILED: (ticker: string) => string;

  // Disclaimer
  DISCLAIMER_FULL: string;
  WELCOME_WITH_DISCLAIMER: string;
  WELCOME_BACK: string;

  // Help
  HELP_TEXT: string;
}

/**
 * Centralized bot messages for consistent user communication
 * All user-facing messages should be defined here
 */
export const BotMessages: BotMessagesType = {
  // Session management
  NEW_SESSION: `🔄 New Session Started!

Previous conversation cleared. Let's start fresh!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Available Commands:

Analysis:
  /analyze TICKER - Full stock analysis + DCF
  /earnings TICKER [Q] - Quarterly earnings analysis
  /earnings_summary TICKER - Quick earnings snapshot
  /sentiment TICKER - Market sentiment analysis
  /news TICKER - Recent news impact

Session:
  /status - View session info
  /new or /reset - Start another fresh session
  /help - Show all commands

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 You can also ask questions naturally:
  "What's AAPL's P/E ratio?"
  "Compare TSLA to RIVN"
  "Explain free cash flow"

Ready when you are!`,

  NEW_SESSION_FAILED: 'Failed to start new session. Please try again.',

  NO_ACTIVE_SESSION: `No active session.

Use /new to start a conversation or /analyze TICKER for stock analysis.`,

  // Errors
  GENERIC_ERROR: `Sorry, something went wrong. Try:
• /new to start fresh
• /status to check session
• /help for assistance`,

  UNABLE_TO_IDENTIFY_CHAT: 'Unable to identify chat. Please try again.',

  ANALYSIS_FAILED: (ticker: string) =>
    `Failed to start analysis for ${ticker}. Please try again.`,

  SESSION_STATUS_FAILED: 'Failed to get session status.',

  WAIT_FOR_RESPONSE: '⏳ Please wait for the current response to complete...',

  // Conversation
  CONTEXT_COMPACTED: `Context has grown large and was compacted to maintain performance.

You can continue chatting, or use /new to start completely fresh.`,

  CONVERSATION_FAILED: 'Failed to start conversation. Please try again.',

  // Commands
  ANALYZE_USAGE: `Usage: /analyze TICKER
Example: /analyze AAPL`,

  STARTING_ANALYSIS: (ticker: string) => `📊 Starting analysis for ${ticker}...`,

  // New workflow commands
  EARNINGS_USAGE: `Usage: /earnings TICKER [QUARTER]
Examples:
  /earnings AAPL
  /earnings TSLA Q3
  /earnings MSFT Q4-2024`,

  STARTING_EARNINGS_ANALYSIS: (ticker: string, quarter?: string) =>
    quarter
      ? `📈 Analyzing ${quarter} earnings for ${ticker}...`
      : `📈 Analyzing latest earnings for ${ticker}...`,

  EARNINGS_ANALYSIS_FAILED: (ticker: string) =>
    `Failed to analyze earnings for ${ticker}. Please try again.`,

  EARNINGS_SUMMARY_USAGE: `Usage: /earnings_summary TICKER
Example: /earnings_summary AAPL`,

  EARNINGS_SUMMARY_FAILED: (ticker: string) =>
    `Failed to get earnings summary for ${ticker}. Please try again.`,

  SENTIMENT_USAGE: `Usage: /sentiment TICKER
Example: /sentiment AAPL`,

  STARTING_SENTIMENT_ANALYSIS: (ticker: string) =>
    `📰 Analyzing sentiment for ${ticker}...`,

  SENTIMENT_ANALYSIS_FAILED: (ticker: string) =>
    `Failed to analyze sentiment for ${ticker}. Please try again.`,

  NEWS_USAGE: `Usage: /news TICKER
Example: /news AAPL`,

  STARTING_NEWS_ANALYSIS: (ticker: string) =>
    `📰 Analyzing news for ${ticker}...`,

  NEWS_ANALYSIS_FAILED: (ticker: string) =>
    `Failed to analyze news for ${ticker}. Please try again.`,

  // Disclaimer
  DISCLAIMER_FULL: `⚠️ FINANCIAL DISCLAIMER

Stock Analyzer Bot provides educational financial
analysis ONLY. This is NOT investment advice.

Key Points:
• We are NOT licensed financial advisors
• We do NOT recommend specific investments
• YOU are solely responsible for your decisions
• All investments carry risk (including loss of principal)
• Past performance ≠ future results
• Data may contain errors or delays

By using this bot, you acknowledge:
✓ You've read and understood this disclaimer
✓ You'll conduct your own research
✓ You'll consult licensed professionals before investing
✓ You accept all investment risks

Questions? Contact support.`,

  WELCOME_WITH_DISCLAIMER: `👋 Welcome to Stock Analyzer${process.env['NODE_ENV'] === 'development' ? ' 🔧 [DEV]' : ''}!

⚠️ DISCLAIMER
This bot provides educational analysis only.
NOT investment advice. You're responsible for
your investment decisions. Always consult a
licensed financial advisor.

By continuing, you acknowledge the above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 WHAT I CAN DO:

📊 Stock Analysis Commands:
  /analyze TICKER
  → Full comprehensive analysis with DCF valuation
  → Includes PDF report (2-3 minutes)

  /earnings TICKER [Q]
  → Deep quarterly earnings analysis
  → Example: /earnings AAPL Q4

  /earnings_summary TICKER
  → Quick earnings snapshot (30 seconds)

  /sentiment TICKER
  → Market sentiment from news & social media

  /news TICKER
  → Recent news impact analysis

💬 Conversation Mode:
  After running an analysis, you can ask follow-up
  questions naturally:
  • "What's the P/E ratio?"
  • "Compare to MSFT"
  • "What are the risks?"

🛠️ Utility Commands:
  /status - View your active session
  /new or /reset - Start fresh analysis
  /disclaimer - View full legal terms
  /help - Show command list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 QUICK START:

1️⃣ Run an analysis:
   /analyze AAPL

2️⃣ Ask follow-up questions:
   "What's driving the valuation?"

3️⃣ Try other commands:
   /sentiment TSLA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Need help? Type /help anytime!`,

  WELCOME_BACK: `👋 Welcome back to Stock Analyzer${process.env['NODE_ENV'] === 'development' ? ' 🔧 [DEV]' : ''}!

📊 Quick Commands:
  /analyze TICKER - Full analysis with DCF
  /earnings TICKER - Quarterly earnings deep-dive
  /sentiment TICKER - Market sentiment analysis
  /news TICKER - Recent news impact

💬 Or just ask a question naturally!

Type /help to see all commands.`,

  // Help
  HELP_TEXT: `Stock Analyzer Bot${process.env['NODE_ENV'] === 'development' ? ' 🔧 [DEV]' : ''}

Commands:
/analyze TICKER - Full stock analysis
/earnings TICKER [Q] - Quarterly earnings analysis
/earnings_summary TICKER - Quick earnings snapshot
/sentiment TICKER - Market sentiment analysis
/news TICKER - Recent news impact analysis
/status - View session info
/disclaimer - View financial disclaimer
/new or /reset - Start fresh session
/help - Show this message

You can also ask me any financial questions directly!

Examples:
• "What's a P/E ratio?"
• "Compare AAPL to MSFT"
• "Explain DCF valuation"`,
};
