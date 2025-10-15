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

  // Help
  HELP_TEXT: `Stock Analyzer Bot

Commands:
/analyze TICKER - Full stock analysis
/status - View session info
/new or /reset - Start fresh session
/help - Show this message

You can also ask me any financial questions directly!`,
};
