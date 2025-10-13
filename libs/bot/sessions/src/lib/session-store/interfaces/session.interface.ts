export enum SessionStatus {
  ACTIVE = 'active', // Currently analyzing
  COMPLETED = 'completed', // Analysis done, available for conversation
  STOPPED = 'stopped', // User manually stopped
  EXPIRED = 'expired', // Timed out
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AnalysisSession {
  chatId: string;
  sessionId: string;
  ticker: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;

  // Analysis data (only for COMPLETED sessions)
  fullAnalysis?: string;
  executiveSummary?: string;

  // Conversation history (for follow-up questions)
  conversationHistory: ConversationMessage[];
}
