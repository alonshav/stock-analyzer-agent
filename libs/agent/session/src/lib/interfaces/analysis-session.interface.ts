/**
 * Analysis session interface
 * Represents a single stock analysis session with conversation history
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AnalysisSession {
  sessionId: string;           // Unique ID: "AAPL-1234567890"
  ticker: string;              // Stock ticker: "AAPL"
  chatId: string;              // Telegram chat ID
  status: 'active' | 'completed' | 'stopped' | 'expired';

  // Timestamps
  startedAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  completedAt?: Date;

  // Analysis results
  fullAnalysis?: string;
  executiveSummary?: string;

  // Conversation history
  conversationHistory: ConversationMessage[];

  // Metrics
  metrics: {
    tokens: number;
    toolCalls: number;
    turns: number;
    errors: number;
  };
}
