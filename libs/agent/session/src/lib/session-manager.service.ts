/**
 * SessionManagerService
 * Manages analysis sessions and conversation history
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AnalysisSession, ConversationMessage } from './interfaces/analysis-session.interface';

@Injectable()
export class SessionManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionManagerService.name);
  private readonly sessions = new Map<string, AnalysisSession[]>();
  private readonly SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour
  private readonly MAX_SESSIONS_PER_CHAT = 5;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private cleanupTimer?: NodeJS.Timeout;

  onModuleInit() {
    // Start automatic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL);

    this.logger.log('Session manager initialized with automatic cleanup');
  }

  onModuleDestroy() {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Create a new analysis session
   */
  createSession(chatId: string, ticker: string): AnalysisSession {
    const sessionId = `${ticker}-${Date.now()}`;
    const now = new Date();

    const session: AnalysisSession = {
      sessionId,
      ticker,
      chatId,
      status: 'active',
      startedAt: now,
      lastActivity: now,
      expiresAt: new Date(now.getTime() + this.SESSION_TIMEOUT),
      conversationHistory: [],
      metrics: {
        tokens: 0,
        toolCalls: 0,
        turns: 0,
        errors: 0,
      },
    };

    // Add to sessions list for this chat
    const chatSessions = this.sessions.get(chatId) || [];
    chatSessions.push(session);

    // Keep only last MAX_SESSIONS_PER_CHAT
    if (chatSessions.length > this.MAX_SESSIONS_PER_CHAT) {
      chatSessions.shift();
    }

    this.sessions.set(chatId, chatSessions);

    this.logger.log(`Created session ${sessionId} for ${ticker} (chat: ${chatId})`);
    return session;
  }

  /**
   * Get the active session for a chat
   */
  getActiveSession(chatId: string): AnalysisSession | null {
    const chatSessions = this.sessions.get(chatId);
    if (!chatSessions) return null;

    // Find most recent active session that hasn't expired
    const activeSession = [...chatSessions]
      .reverse()
      .find(s => s.status === 'active' && s.expiresAt > new Date());

    return activeSession || null;
  }

  /**
   * Get recent completed sessions for comparison
   */
  getRecentSessions(chatId: string, limit = 5): AnalysisSession[] {
    const chatSessions = this.sessions.get(chatId);
    if (!chatSessions) return [];

    return chatSessions
      .filter(s => s.status === 'completed')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Add a message to the conversation history
   */
  addMessage(chatId: string, role: 'user' | 'assistant', content: string): void {
    const session = this.getActiveSession(chatId);
    if (!session) {
      throw new Error(`No active session for chat ${chatId}`);
    }

    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    session.lastActivity = new Date();
    session.metrics.turns += 1;
  }

  /**
   * Add a metric value to the session
   */
  addMetric(chatId: string, metric: keyof AnalysisSession['metrics'], value: number): void {
    const session = this.getActiveSession(chatId);
    if (!session) return; // Silently ignore if no session

    session.metrics[metric] += value;
  }

  /**
   * Mark session as completed and save results
   */
  completeSession(chatId: string, fullAnalysis: string, executiveSummary: string): void {
    const session = this.getActiveSession(chatId);
    if (!session) {
      throw new Error(`No active session for chat ${chatId}`);
    }

    session.status = 'completed';
    session.fullAnalysis = fullAnalysis;
    session.executiveSummary = executiveSummary;
    session.completedAt = new Date();

    this.logger.log(`Completed session ${session.sessionId}`);
  }

  /**
   * Manually stop the active session
   */
  stopSession(chatId: string): boolean {
    const session = this.getActiveSession(chatId);
    if (!session) return false;

    session.status = 'stopped';
    this.logger.log(`Stopped session ${session.sessionId}`);
    return true;
  }

  /**
   * Build context prompt from session history
   */
  buildContextPrompt(chatId: string, newMessage: string): string {
    const activeSession = this.getActiveSession(chatId);
    if (!activeSession) {
      throw new Error(`No active session for chat ${chatId}`);
    }

    const recentSessions = this.getRecentSessions(chatId, 5);

    let prompt = '';

    // Add recent sessions for comparison
    if (recentSessions.length > 0) {
      prompt += 'Recent analysis sessions (for reference):\n\n';
      for (const session of recentSessions) {
        prompt += `--- ${session.ticker} Analysis ---\n`;
        prompt += `${session.executiveSummary || 'Analysis in progress...'}\n\n`;
      }
    }

    // Add current session context
    prompt += `Current conversation about ${activeSession.ticker}:\n\n`;

    // Add conversation history
    for (const msg of activeSession.conversationHistory) {
      prompt += `${msg.role}: ${msg.content}\n`;
    }

    // Add new message
    prompt += `user: ${newMessage}\n`;

    return prompt;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [chatId, sessions] of this.sessions.entries()) {
      const validSessions = sessions.filter(s => {
        if (s.status === 'active' && s.expiresAt < now) {
          s.status = 'expired';
          cleaned++;
          return false;
        }
        return true;
      });

      if (validSessions.length === 0) {
        this.sessions.delete(chatId);
      } else {
        this.sessions.set(chatId, validSessions);
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired sessions`);
    }
  }
}
