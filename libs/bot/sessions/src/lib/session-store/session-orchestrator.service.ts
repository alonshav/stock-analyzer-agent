import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from './interfaces/session-repository.interface';
import { AnalysisSession, SessionStatus } from './interfaces/session.interface';

@Injectable()
export class SessionOrchestrator {
  private readonly logger = new Logger(SessionOrchestrator.name);
  private readonly SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository
  ) {}

  // Session lifecycle
  createSession(chatId: string, ticker: string): AnalysisSession {
    this.logger.log(`Creating session for chat ${chatId}, ticker ${ticker}`);
    return this.sessionRepository.createSession(chatId, ticker);
  }

  getActiveSession(chatId: string): AnalysisSession | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status === SessionStatus.ACTIVE ? session : null;
  }

  getCompletedSession(chatId: string): AnalysisSession | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status === SessionStatus.COMPLETED ? session : null;
  }

  completeSession(
    chatId: string,
    fullAnalysis: string,
    executiveSummary: string
  ): void {
    this.logger.log(`Completing session for chat ${chatId}`);
    this.sessionRepository.saveAnalysisResults(
      chatId,
      fullAnalysis,
      executiveSummary
    );
  }

  stopSession(chatId: string): void {
    this.logger.log(`Stopping session for chat ${chatId}`);
    this.sessionRepository.updateSessionStatus(chatId, SessionStatus.STOPPED);
  }

  // Conversation management
  addUserMessage(chatId: string, content: string): void {
    this.sessionRepository.addConversationMessage(chatId, 'user', content);
  }

  addAssistantMessage(chatId: string, content: string): void {
    this.sessionRepository.addConversationMessage(chatId, 'assistant', content);
  }

  getConversationHistory(chatId: string) {
    return this.sessionRepository.getConversationHistory(chatId);
  }

  // Cleanup
  @Cron(CronExpression.EVERY_5_MINUTES)
  private cleanupExpiredSessions(): void {
    const count = this.sessionRepository.cleanupExpiredSessions(
      this.SESSION_EXPIRY_MS
    );
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired sessions`);
    }
  }

  // Status queries
  getSessionStatus(chatId: string): SessionStatus | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status || null;
  }

  hasActiveSession(chatId: string): boolean {
    return this.getActiveSession(chatId) !== null;
  }

  hasCompletedSession(chatId: string): boolean {
    return this.getCompletedSession(chatId) !== null;
  }
}
