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
  NEW_SESSION: `Started a new conversation session.

You can:
• Ask me any financial questions
• Use /analyze TICKER for full stock analysis
• Use /status to see current session info
• Use /help for more commands`,

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

  WELCOME_WITH_DISCLAIMER: `👋 Welcome to Stock Analyzer!

⚠️ DISCLAIMER
This bot provides educational analysis only.
NOT investment advice. You're responsible for
your investment decisions. Always consult a
licensed financial advisor.

By continuing, you acknowledge the above.

💬 Ask me anything about stocks
📊 Get comprehensive company analyses
📈 Analyze quarterly earnings reports
📰 Track news and sentiment

Quick start:
• Try: /analyze AAPL
• Try: /earnings TSLA
• Or just ask a question!

Type /disclaimer anytime to see full terms.`,

  WELCOME_BACK: `👋 Welcome back to Stock Analyzer!

💬 Ask me anything about stocks
📊 Get comprehensive analyses
📈 Analyze quarterly earnings

Ready when you are!`,

  // Help
  HELP_TEXT: `Stock Analyzer Bot

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
