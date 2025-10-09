/**
 * Mock utilities for testing session management
 */

export interface MockAnalysisSession {
  sessionId: string;
  ticker: string;
  chatId: string;
  status: 'active' | 'completed' | 'stopped' | 'expired';
  startedAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  completedAt?: Date;
  fullAnalysis?: string;
  executiveSummary?: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  metrics: {
    tokens: number;
    toolCalls: number;
    turns: number;
    errors: number;
  };
}

export class MockSessionManager {
  /**
   * Create basic test session
   */
  static createTestSession(
    ticker: string,
    chatId: string,
    overrides?: Partial<MockAnalysisSession>
  ): MockAnalysisSession {
    const now = new Date();
    return {
      sessionId: `${ticker}-${Date.now()}`,
      ticker,
      chatId,
      status: 'active',
      startedAt: now,
      lastActivity: now,
      expiresAt: new Date(now.getTime() + 3600000), // 1 hour
      conversationHistory: [],
      metrics: {
        tokens: 0,
        toolCalls: 0,
        turns: 0,
        errors: 0,
      },
      ...overrides,
    };
  }

  /**
   * Create active session
   */
  static createActiveSession(
    ticker: string,
    chatId: string
  ): MockAnalysisSession {
    return MockSessionManager.createTestSession(ticker, chatId, {
      status: 'active',
    });
  }

  /**
   * Create expired session
   */
  static createExpiredSession(
    ticker: string,
    chatId: string
  ): MockAnalysisSession {
    const now = new Date();
    return MockSessionManager.createTestSession(ticker, chatId, {
      status: 'expired',
      expiresAt: new Date(now.getTime() - 1000), // Expired 1 second ago
    });
  }

  /**
   * Create completed session
   */
  static createCompletedSession(
    ticker: string,
    chatId: string,
    analysis?: string,
    summary?: string
  ): MockAnalysisSession {
    const now = new Date();
    return MockSessionManager.createTestSession(ticker, chatId, {
      status: 'completed',
      completedAt: now,
      fullAnalysis: analysis || `Full analysis of ${ticker}`,
      executiveSummary: summary || `Summary of ${ticker}`,
    });
  }

  /**
   * Create session with conversation history
   */
  static createSessionWithHistory(
    ticker: string,
    chatId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): MockAnalysisSession {
    const now = new Date();
    const session = MockSessionManager.createTestSession(ticker, chatId);

    session.conversationHistory = messages.map((msg, index) => ({
      role: msg.role,
      content: msg.content,
      timestamp: new Date(now.getTime() + index * 1000),
    }));

    return session;
  }

  /**
   * Create session with metrics
   */
  static createSessionWithMetrics(
    ticker: string,
    chatId: string,
    metrics: Partial<MockAnalysisSession['metrics']>
  ): MockAnalysisSession {
    return MockSessionManager.createTestSession(ticker, chatId, {
      metrics: {
        tokens: metrics.tokens || 0,
        toolCalls: metrics.toolCalls || 0,
        turns: metrics.turns || 0,
        errors: metrics.errors || 0,
      },
    });
  }

  /**
   * Create multiple sessions for testing recent sessions
   */
  static createMultipleSessions(
    chatId: string,
    tickers: string[],
    delayMs = 100
  ): MockAnalysisSession[] {
    return tickers.map((ticker, index) => {
      const session = MockSessionManager.createCompletedSession(ticker, chatId);
      // Offset timestamps to ensure ordering
      session.startedAt = new Date(Date.now() - (tickers.length - index) * delayMs);
      return session;
    });
  }
}
