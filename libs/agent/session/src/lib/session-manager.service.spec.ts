/**
 * SessionManagerService Tests (TDD - Tests First)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SessionManagerService } from './session-manager.service';
import { SessionStatus, MessageRole } from './interfaces/analysis-session.interface';

describe('SessionManagerService', () => {
  let service: SessionManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionManagerService],
    }).compile();

    service = module.get<SessionManagerService>(SessionManagerService);

    // Clear any existing sessions
    service['sessions'].clear();
  });

  describe('createSession', () => {
    it('should create new session with unique ID', () => {
      const session = service.createSession('chat1', 'AAPL');

      expect(session.sessionId).toMatch(/^AAPL-\d+$/);
      expect(session.ticker).toBe('AAPL');
      expect(session.chatId).toBe('chat1');
      expect(session.status).toBe(SessionStatus.ACTIVE);
    });

    it('should set expiration to 1 hour from now', () => {
      const session = service.createSession('chat1', 'AAPL');
      const expectedExpiry = Date.now() + 3600000;

      expect(session.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3);
    });

    it('should initialize empty conversation history', () => {
      const session = service.createSession('chat1', 'AAPL');

      expect(session.conversationHistory).toEqual([]);
    });

    it('should initialize metrics at zero', () => {
      const session = service.createSession('chat1', 'AAPL');

      expect(session.metrics).toEqual({
        tokens: 0,
        toolCalls: 0,
        turns: 0,
        errors: 0,
      });
    });

    it('should keep only last 5 sessions per chat', () => {
      // Create 6 sessions
      for (let i = 1; i <= 6; i++) {
        service.createSession('chat1', `TICK${i}`);
      }

      const chatSessions = service['sessions'].get('chat1');
      expect(chatSessions).toHaveLength(5);
      expect(chatSessions![0].ticker).toBe('TICK2'); // First session (TICK1) removed
    });
  });

  describe('getActiveSession', () => {
    it('should return active session for chatId', () => {
      const created = service.createSession('chat1', 'AAPL');
      const retrieved = service.getActiveSession('chat1');

      expect(retrieved).toEqual(created);
    });

    it('should return null when no session exists', () => {
      const retrieved = service.getActiveSession('chat999');

      expect(retrieved).toBeNull();
    });

    it('should return null for expired sessions', () => {
      const session = service.createSession('chat1', 'AAPL');
      // Manually expire the session
      session.expiresAt = new Date(Date.now() - 1000);

      const retrieved = service.getActiveSession('chat1');

      expect(retrieved).toBeNull();
    });

    it('should return null after completeSession (status changed to COMPLETED)', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full analysis', 'Summary');

      const retrieved = service.getActiveSession('chat1');

      expect(retrieved).toBeNull(); // getActiveSession() only returns ACTIVE
    });

    it('should return null for stopped sessions', () => {
      service.createSession('chat1', 'AAPL');
      service.stopSession('chat1');

      const retrieved = service.getActiveSession('chat1');

      expect(retrieved).toBeNull();
    });
  });

  describe('getCompletedSession', () => {
    it('should return completed session for chatId', () => {
      const created = service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full', 'Summary');

      const retrieved = service.getCompletedSession('chat1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.sessionId).toBe(created.sessionId);
      expect(retrieved!.status).toBe(SessionStatus.COMPLETED);
    });

    it('should return null when no completed session exists', () => {
      service.createSession('chat1', 'AAPL'); // ACTIVE, not completed

      const retrieved = service.getCompletedSession('chat1');

      expect(retrieved).toBeNull();
    });

    it('should return null for expired completed sessions', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full', 'Summary');

      const sessions = service['sessions'].get('chat1')!;
      sessions[0].expiresAt = new Date(Date.now() - 1000);

      const retrieved = service.getCompletedSession('chat1');

      expect(retrieved).toBeNull();
    });

    it('should return most recent completed session', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'A1', 'S1');

      service.createSession('chat1', 'MSFT');
      service.completeSession('chat1', 'A2', 'S2');

      const retrieved = service.getCompletedSession('chat1');

      expect(retrieved!.ticker).toBe('MSFT'); // Most recent
    });
  });

  describe('addMessage', () => {
    it('should add user message to conversation history', () => {
      service.createSession('chat1', 'AAPL');
      service.addMessage('chat1', MessageRole.USER, 'What is the P/E ratio?');

      const session = service.getActiveSession('chat1')!;
      expect(session.conversationHistory).toHaveLength(1);
      expect(session.conversationHistory[0]).toMatchObject({
        role: MessageRole.USER,
        content: 'What is the P/E ratio?',
      });
    });

    it('should add assistant message to conversation history', () => {
      service.createSession('chat1', 'AAPL');
      service.addMessage('chat1', MessageRole.ASSISTANT, 'The P/E ratio is 28.5');

      const session = service.getActiveSession('chat1')!;
      expect(session.conversationHistory[0].role).toBe(MessageRole.ASSISTANT);
    });

    it('should update lastActivity timestamp', () => {
      service.createSession('chat1', 'AAPL');
      const beforeTime = Date.now();

      service.addMessage('chat1', MessageRole.USER, 'Hello');
      const afterTime = Date.now();

      const session = service.getActiveSession('chat1')!;
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(session.lastActivity.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should throw when session does not exist', () => {
      expect(() => {
        service.addMessage('chat999', MessageRole.USER, 'Hello');
      }).toThrow('No active or completed session');
    });

    it('should increment turns metric', () => {
      service.createSession('chat1', 'AAPL');
      service.addMessage('chat1', MessageRole.USER, 'Question 1');
      service.addMessage('chat1', MessageRole.ASSISTANT, 'Answer 1');

      const session = service.getActiveSession('chat1')!;
      expect(session.metrics.turns).toBe(2);
    });
  });

  describe('buildContextPrompt', () => {
    it('should include active session analysis', () => {
      const session = service.createSession('chat1', 'AAPL');
      session.executiveSummary = 'Apple shows strong fundamentals...';

      const prompt = service.buildContextPrompt('chat1', 'What is the P/E?');

      expect(prompt).toContain('Current conversation about AAPL');
      expect(prompt).toContain('What is the P/E?');
    });

    it('should include conversation history', () => {
      service.createSession('chat1', 'AAPL');
      service.addMessage('chat1', MessageRole.USER, 'First question');
      service.addMessage('chat1', MessageRole.ASSISTANT, 'First answer');

      const prompt = service.buildContextPrompt('chat1', 'Second question');

      expect(prompt).toContain('First question');
      expect(prompt).toContain('First answer');
      expect(prompt).toContain('Second question');
    });

    it('should include recent sessions for comparison', () => {
      // Create and complete AAPL session
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'AAPL analysis', 'AAPL summary');

      // Create active MSFT session
      service.createSession('chat1', 'MSFT');
      service['sessions'].get('chat1')![1].executiveSummary = 'MSFT summary';

      const prompt = service.buildContextPrompt('chat1', 'Compare to Apple');

      expect(prompt).toContain('AAPL Analysis');
      expect(prompt).toContain('MSFT'); // Active session ticker appears in "Current conversation about MSFT"
    });

    it('should limit to last 5 sessions', () => {
      // Create 6 completed sessions
      for (let i = 1; i <= 6; i++) {
        service.createSession('chat1', `TICK${i}`);
        service.completeSession('chat1', `Analysis ${i}`, `Summary ${i}`);
      }

      // Create one active session
      service.createSession('chat1', 'ACTIVE');

      const prompt = service.buildContextPrompt('chat1', 'Question');

      // Should NOT include TICK1 (oldest, exceeded MAX_SESSIONS_PER_CHAT)
      expect(prompt).not.toContain('TICK1');
      // Should include TICK3-TICK6 (last 4 completed within MAX_SESSIONS limit)
      expect(prompt).toContain('TICK6');
      expect(prompt).toContain('TICK3');
    });

    it('should throw when no active session', () => {
      expect(() => {
        service.buildContextPrompt('chat999', 'Question');
      }).toThrow('No active or completed session');
    });
  });

  describe('completeSession', () => {
    it('should save analysis results', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full analysis text', 'Summary text');

      const sessions = service['sessions'].get('chat1')!;
      const session = sessions[0];

      expect(session.fullAnalysis).toBe('Full analysis text');
      expect(session.executiveSummary).toBe('Summary text');
    });

    it('should set status to completed', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'Full', 'Summary');

      const sessions = service['sessions'].get('chat1')!;
      expect(sessions[0].status).toBe(SessionStatus.COMPLETED);
    });

    it('should set completedAt timestamp', () => {
      service.createSession('chat1', 'AAPL');
      const beforeTime = Date.now();

      service.completeSession('chat1', 'Full', 'Summary');
      const afterTime = Date.now();

      const sessions = service['sessions'].get('chat1')!;
      const session = sessions[0];

      expect(session.completedAt!.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(session.completedAt!.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should throw when no active session', () => {
      expect(() => {
        service.completeSession('chat999', 'Full', 'Summary');
      }).toThrow('No active session');
    });
  });

  describe('stopSession', () => {
    it('should set status to stopped', () => {
      service.createSession('chat1', 'AAPL');
      service.stopSession('chat1');

      const sessions = service['sessions'].get('chat1')!;
      expect(sessions[0].status).toBe(SessionStatus.STOPPED);
    });

    it('should return false when no active session', () => {
      const result = service.stopSession('chat999');

      expect(result).toBe(false);
    });

    it('should return true when session stopped', () => {
      service.createSession('chat1', 'AAPL');
      const result = service.stopSession('chat1');

      expect(result).toBe(true);
    });
  });

  describe('addMetric', () => {
    it('should increment token count', () => {
      service.createSession('chat1', 'AAPL');
      service.addMetric('chat1', 'tokens', 1500);
      service.addMetric('chat1', 'tokens', 800);

      const session = service.getActiveSession('chat1')!;
      expect(session.metrics.tokens).toBe(2300);
    });

    it('should increment tool call count', () => {
      service.createSession('chat1', 'AAPL');
      service.addMetric('chat1', 'toolCalls', 1);
      service.addMetric('chat1', 'toolCalls', 1);

      const session = service.getActiveSession('chat1')!;
      expect(session.metrics.toolCalls).toBe(2);
    });

    it('should increment error count', () => {
      service.createSession('chat1', 'AAPL');
      service.addMetric('chat1', 'errors', 1);

      const session = service.getActiveSession('chat1')!;
      expect(session.metrics.errors).toBe(1);
    });

    it('should not throw when session does not exist', () => {
      expect(() => {
        service.addMetric('chat999', 'tokens', 100);
      }).not.toThrow();
    });
  });

  describe('getRecentSessions', () => {
    it('should return sessions sorted by recency', async () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'A1', 'S1');

      // Wait 10ms to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      service.createSession('chat1', 'MSFT');
      service.completeSession('chat1', 'A2', 'S2');

      const recent = service.getRecentSessions('chat1');

      expect(recent[0].ticker).toBe('MSFT');
      expect(recent[1].ticker).toBe('AAPL');
    });

    it('should limit to specified count', () => {
      for (let i = 1; i <= 10; i++) {
        service.createSession('chat1', `TICK${i}`);
        service.completeSession('chat1', 'A', 'S');
      }

      const recent = service.getRecentSessions('chat1', 3);

      expect(recent).toHaveLength(3);
    });

    it('should return both ACTIVE and COMPLETED sessions', async () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'A', 'S'); // COMPLETED

      // Wait 10ms to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      service.createSession('chat1', 'MSFT'); // ACTIVE

      const recent = service.getRecentSessions('chat1');

      // Returns both ACTIVE and COMPLETED
      expect(recent).toHaveLength(2);
      expect(recent[0].ticker).toBe('MSFT'); // Most recent (ACTIVE)
      expect(recent[1].ticker).toBe('AAPL'); // Older (COMPLETED)
    });

    it('should return empty array when no sessions', () => {
      const recent = service.getRecentSessions('chat999');

      expect(recent).toEqual([]);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'A', 'S'); // Must be COMPLETED to be cleaned up

      const sessions = service['sessions'].get('chat1')!;
      sessions[0].expiresAt = new Date(Date.now() - 1000);

      service.cleanupExpiredSessions();

      const remainingSessions = service['sessions'].get('chat1');
      expect(remainingSessions).toBeUndefined();
    });

    it('should not remove active sessions', () => {
      service.createSession('chat1', 'AAPL');

      service.cleanupExpiredSessions();

      const session = service.getActiveSession('chat1');
      expect(session).not.toBeNull();
    });

    it('should NOT expire ACTIVE sessions (only COMPLETED ones)', () => {
      const session = service.createSession('chat1', 'AAPL');
      session.expiresAt = new Date(Date.now() - 1000); // Expired time but still ACTIVE

      service.cleanupExpiredSessions();

      const sessions = service['sessions'].get('chat1');
      expect(sessions).toHaveLength(1); // Should NOT be removed
      expect(sessions![0].status).toBe(SessionStatus.ACTIVE);
    });

    it('should expire COMPLETED sessions that have timed out', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'A', 'S');

      const sessions = service['sessions'].get('chat1')!;
      sessions[0].expiresAt = new Date(Date.now() - 1000); // Expired

      service.cleanupExpiredSessions();

      const remainingSessions = service['sessions'].get('chat1');
      expect(remainingSessions).toBeUndefined(); // Should be removed
    });

    it('should preserve non-expired sessions', () => {
      service.createSession('chat1', 'AAPL');
      service.completeSession('chat1', 'A1', 'S1'); // Complete AAPL

      service.createSession('chat1', 'MSFT');
      service.completeSession('chat1', 'A2', 'S2'); // Complete MSFT

      // Expire only first session (AAPL)
      const sessions = service['sessions'].get('chat1')!;
      sessions[0].expiresAt = new Date(Date.now() - 1000);

      service.cleanupExpiredSessions();

      const remainingSessions = service['sessions'].get('chat1');
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions![0].ticker).toBe('MSFT');
    });
  });

  describe('Module Lifecycle', () => {
    it('should start cleanup timer on module init', () => {
      jest.useFakeTimers();
      const cleanupSpy = jest.spyOn(service, 'cleanupExpiredSessions');

      service.onModuleInit();

      // Fast-forward 5 minutes
      jest.advanceTimersByTime(300000);

      expect(cleanupSpy).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
