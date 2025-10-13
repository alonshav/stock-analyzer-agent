import {
  AnalysisSession,
  SessionStatus,
  ConversationMessage,
} from './session.interface';

/**
 * Injection token for ISessionRepository
 * Use this token when injecting the repository via @Inject()
 */
export const SESSION_REPOSITORY = 'SESSION_REPOSITORY';

export interface ISessionRepository {
  // Session lifecycle
  createSession(chatId: string, ticker: string): AnalysisSession;
  getSession(chatId: string): AnalysisSession | null;
  updateSessionStatus(chatId: string, status: SessionStatus): void;
  deleteSession(chatId: string): void;

  // Analysis data
  saveAnalysisResults(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): void;

  // Conversation management
  addConversationMessage(
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): void;
  getConversationHistory(chatId: string): ConversationMessage[];

  // Cleanup
  cleanupExpiredSessions(expiryDurationMs: number): number;

  // Query methods
  getAllActiveSessions(): AnalysisSession[];
  getSessionsByStatus(status: SessionStatus): AnalysisSession[];
}
