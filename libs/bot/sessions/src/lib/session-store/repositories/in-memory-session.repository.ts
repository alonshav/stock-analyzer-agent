import { Injectable } from '@nestjs/common';
import {
  ISessionRepository,
  ChatSession,
  SessionStatus,
  ConversationMessage,
} from '../interfaces';

@Injectable()
export class InMemorySessionRepository implements ISessionRepository {
  private sessions = new Map<string, ChatSession>();

  saveSession(session: ChatSession): void {
    this.sessions.set(session.chatId, session);
  }

  getSession(chatId: string): ChatSession | null {
    return this.sessions.get(chatId) || null;
  }

  deleteSession(chatId: string): void {
    this.sessions.delete(chatId);
  }

  getConversationHistory(chatId: string): ConversationMessage[] {
    const session = this.sessions.get(chatId);
    return session?.conversationHistory || [];
  }

  cleanupOldStoppedSessions(cutoffDate: Date): number {
    let cleanedCount = 0;
    const cutoffTime = cutoffDate.getTime();

    for (const [chatId, session] of this.sessions.entries()) {
      // Only clean up STOPPED sessions older than cutoff date
      if (session.status === SessionStatus.STOPPED) {
        const sessionTime = session.updatedAt.getTime();
        if (sessionTime < cutoffTime) {
          this.sessions.delete(chatId);
          cleanedCount++;
        }
      }
    }

    return cleanedCount;
  }

  getAllActiveSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === SessionStatus.ACTIVE
    );
  }

  getSessionsByStatus(status: SessionStatus): ChatSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === status
    );
  }
}
