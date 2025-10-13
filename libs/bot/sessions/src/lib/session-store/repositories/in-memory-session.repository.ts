import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ISessionRepository,
  AnalysisSession,
  SessionStatus,
  ConversationMessage,
} from '../interfaces';

@Injectable()
export class InMemorySessionRepository implements ISessionRepository {
  private sessions = new Map<string, AnalysisSession>();

  createSession(chatId: string, ticker: string): AnalysisSession {
    const session: AnalysisSession = {
      chatId,
      sessionId: uuidv4(),
      ticker,
      status: SessionStatus.ACTIVE,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      conversationHistory: [],
    };

    this.sessions.set(chatId, session);
    return session;
  }

  getSession(chatId: string): AnalysisSession | null {
    return this.sessions.get(chatId) || null;
  }

  updateSessionStatus(chatId: string, status: SessionStatus): void {
    const session = this.sessions.get(chatId);
    if (!session) return;

    session.status = status;
    session.lastActivityAt = new Date();

    if (status === SessionStatus.COMPLETED) {
      session.completedAt = new Date();
    }
  }

  deleteSession(chatId: string): void {
    this.sessions.delete(chatId);
  }

  saveAnalysisResults(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): void {
    const session = this.sessions.get(chatId);
    if (!session) return;

    session.fullAnalysis = fullAnalysis;
    session.executiveSummary = executiveSummary;
    session.status = SessionStatus.COMPLETED;
    session.completedAt = new Date();
    session.lastActivityAt = new Date();
  }

  addConversationMessage(
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): void {
    const session = this.sessions.get(chatId);
    if (!session) return;

    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    session.lastActivityAt = new Date();
  }

  getConversationHistory(chatId: string): ConversationMessage[] {
    const session = this.sessions.get(chatId);
    return session?.conversationHistory || [];
  }

  cleanupExpiredSessions(expiryDurationMs: number): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [chatId, session] of this.sessions.entries()) {
      // Only expire COMPLETED sessions, never ACTIVE ones
      if (session.status !== SessionStatus.COMPLETED) continue;

      const timeSinceActivity = now - session.lastActivityAt.getTime();
      if (timeSinceActivity > expiryDurationMs) {
        session.status = SessionStatus.EXPIRED;
        this.sessions.delete(chatId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  getAllActiveSessions(): AnalysisSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === SessionStatus.ACTIVE
    );
  }

  getSessionsByStatus(status: SessionStatus): AnalysisSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === status
    );
  }
}
