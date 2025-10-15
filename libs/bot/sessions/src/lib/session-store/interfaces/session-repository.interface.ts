import {
  ChatSession,
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
  saveSession(session: ChatSession): void;
  getSession(chatId: string): ChatSession | null;
  deleteSession(chatId: string): void;

  // Conversation management (legacy - consider deprecating)
  getConversationHistory(chatId: string): ConversationMessage[];

  // Cleanup
  cleanupOldStoppedSessions(cutoffDate: Date): number;

  // Query methods
  getAllActiveSessions(): ChatSession[];
  getSessionsByStatus(status: SessionStatus): ChatSession[];
}
