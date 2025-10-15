/**
 * SessionOrchestrator Tests
 * Tests for chat-scoped persistent session management
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SessionOrchestrator } from './session-orchestrator.service';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from './interfaces/session-repository.interface';
import {
  ChatSession,
  SessionStatus,
  MessageRole,
  WorkflowExecution,
} from './interfaces/session.interface';

describe('SessionOrchestrator', () => {
  let orchestrator: SessionOrchestrator;
  let sessionRepository: jest.Mocked<ISessionRepository>;

  // Factory function to create fresh session for each test
  const createMockSession = (): ChatSession => ({
    sessionId: 'chat123-1234567890',
    chatId: '123',
    status: SessionStatus.ACTIVE,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    conversationHistory: [],
    workflows: [],
    metadata: {},
  });

  beforeEach(async () => {
    // Mock session repository
    const mockRepo = {
      getSession: jest.fn(),
      saveSession: jest.fn(),
      deleteSession: jest.fn(),
      cleanupOldStoppedSessions: jest.fn(() => 0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionOrchestrator,
        {
          provide: SESSION_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    orchestrator = module.get<SessionOrchestrator>(SessionOrchestrator);
    sessionRepository = module.get(SESSION_REPOSITORY);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getOrCreateSession', () => {
    it('should return existing ACTIVE session', () => {
      const chatId = '123';
      const mockSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(mockSession);

      const result = orchestrator.getOrCreateSession(chatId);

      expect(result).toEqual(mockSession);
      expect(sessionRepository.getSession).toHaveBeenCalledWith(chatId);
      expect(sessionRepository.saveSession).not.toHaveBeenCalled();
    });

    it('should create new session when none exists', () => {
      const chatId = '456';
      sessionRepository.getSession.mockReturnValue(null);

      const result = orchestrator.getOrCreateSession(chatId);

      expect(result.chatId).toBe(chatId);
      expect(result.status).toBe(SessionStatus.ACTIVE);
      expect(result.conversationHistory).toEqual([]);
      expect(result.workflows).toEqual([]);
      expect(result.sessionId).toMatch(/^chat456-\d+$/);
      expect(sessionRepository.saveSession).toHaveBeenCalledWith(result);
    });

    it('should create new session when previous was STOPPED', () => {
      const chatId = '789';
      const stoppedSession: ChatSession = {
        ...createMockSession(),
        chatId,
        status: SessionStatus.STOPPED,
      };
      sessionRepository.getSession.mockReturnValue(stoppedSession);

      const result = orchestrator.getOrCreateSession(chatId);

      expect(result.chatId).toBe(chatId);
      expect(result.status).toBe(SessionStatus.ACTIVE);
      expect(result.sessionId).not.toBe(stoppedSession.sessionId);
      expect(sessionRepository.saveSession).toHaveBeenCalledWith(result);
    });

    it('should generate unique session IDs', async () => {
      const chatId = '999';
      let savedSession: ChatSession | null = null;

      // Mock getSession to return null first, then the saved session
      sessionRepository.getSession.mockImplementation(() => savedSession);

      // Mock saveSession to capture the saved session
      sessionRepository.saveSession.mockImplementation((session) => {
        savedSession = session;
      });

      const session1 = orchestrator.getOrCreateSession(chatId);

      // Reset savedSession to force creation of a new session
      savedSession = null;

      // Wait 1ms to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1));

      const session2 = orchestrator.getOrCreateSession(chatId);

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('getSession', () => {
    it('should return ACTIVE session', () => {
      const chatId = '123';
      const mockSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(mockSession);

      const result = orchestrator.getSession(chatId);

      expect(result).toEqual(mockSession);
    });

    it('should return null for STOPPED session', () => {
      const chatId = '123';
      const stoppedSession = { ...createMockSession(), status: SessionStatus.STOPPED };
      sessionRepository.getSession.mockReturnValue(stoppedSession);

      const result = orchestrator.getSession(chatId);

      expect(result).toBeNull();
    });

    it('should return null when no session exists', () => {
      const chatId = '999';
      sessionRepository.getSession.mockReturnValue(null);

      const result = orchestrator.getSession(chatId);

      expect(result).toBeNull();
    });
  });

  describe('stopSession', () => {
    it('should change session status to STOPPED', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      orchestrator.stopSession(chatId, 'User started new session');

      expect(activeSession.status).toBe(SessionStatus.STOPPED);
      expect(activeSession.metadata?.['stopReason']).toBe('User started new session');
      expect(sessionRepository.saveSession).toHaveBeenCalledWith(activeSession);
    });

    it('should handle missing session gracefully', () => {
      const chatId = '999';
      sessionRepository.getSession.mockReturnValue(null);

      expect(() => orchestrator.stopSession(chatId)).not.toThrow();
      expect(sessionRepository.saveSession).not.toHaveBeenCalled();
    });

    it('should update session timestamp', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      const beforeTime = new Date();
      sessionRepository.getSession.mockReturnValue(activeSession);

      orchestrator.stopSession(chatId);

      expect(activeSession.updatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime()
      );
    });
  });

  describe('trackWorkflow', () => {
    it('should add workflow to session', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      const workflowId = orchestrator.trackWorkflow(
        chatId,
        'full_analysis',
        'AAPL'
      );

      expect(workflowId).toMatch(/^wf-\d+-[a-z0-9]+$/);
      expect(activeSession.workflows).toHaveLength(1);
      expect(activeSession.workflows[0]).toMatchObject({
        workflowId,
        workflowType: 'full_analysis',
        ticker: 'AAPL',
        startedAt: expect.any(Date),
      });
      expect(sessionRepository.saveSession).toHaveBeenCalledWith(activeSession);
    });

    it('should throw error when no active session exists', () => {
      const chatId = '999';
      sessionRepository.getSession.mockReturnValue(null);

      expect(() =>
        orchestrator.trackWorkflow(chatId, 'full_analysis', 'AAPL')
      ).toThrow('No active session found for chat 999');
    });

    it('should handle workflow without ticker', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      const workflowId = orchestrator.trackWorkflow(chatId, 'sentiment_analysis');

      expect(activeSession.workflows[0].ticker).toBeUndefined();
    });

    it('should generate unique workflow IDs', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      const id1 = orchestrator.trackWorkflow(chatId, 'full_analysis', 'AAPL');
      const id2 = orchestrator.trackWorkflow(chatId, 'full_analysis', 'MSFT');

      expect(id1).not.toBe(id2);
      expect(activeSession.workflows).toHaveLength(2);
    });
  });

  describe('completeWorkflow', () => {
    it('should mark workflow as completed', () => {
      const chatId = '123';
      const workflowId = 'wf-123-abc';
      const activeSession: ChatSession = {
        ...createMockSession(),
        workflows: [
          {
            workflowId,
            workflowType: 'full_analysis',
            ticker: 'AAPL',
            startedAt: new Date(),
          },
        ],
      };
      sessionRepository.getSession.mockReturnValue(activeSession);

      orchestrator.completeWorkflow(chatId, workflowId, 'Analysis complete');

      expect(activeSession.workflows[0].completedAt).toBeInstanceOf(Date);
      expect(activeSession.workflows[0].result).toBe('Analysis complete');
      expect(sessionRepository.saveSession).toHaveBeenCalledWith(activeSession);
    });

    it('should handle missing session gracefully', () => {
      const chatId = '999';
      sessionRepository.getSession.mockReturnValue(null);

      expect(() =>
        orchestrator.completeWorkflow(chatId, 'wf-123', 'result')
      ).not.toThrow();
    });

    it('should handle missing workflow gracefully', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      expect(() =>
        orchestrator.completeWorkflow(chatId, 'wf-nonexistent', 'result')
      ).not.toThrow();
    });
  });

  describe('addMessage', () => {
    it('should add user message to conversation history', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      orchestrator.addMessage(chatId, MessageRole.USER, 'What is the P/E?');

      expect(activeSession.conversationHistory).toHaveLength(1);
      expect(activeSession.conversationHistory[0]).toMatchObject({
        role: MessageRole.USER,
        content: 'What is the P/E?',
        timestamp: expect.any(Date),
      });
      expect(sessionRepository.saveSession).toHaveBeenCalledWith(activeSession);
    });

    it('should add assistant message to conversation history', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      orchestrator.addMessage(
        chatId,
        MessageRole.ASSISTANT,
        'The P/E ratio is 28.5'
      );

      expect(activeSession.conversationHistory).toHaveLength(1);
      expect(activeSession.conversationHistory[0].role).toBe(
        MessageRole.ASSISTANT
      );
    });

    it('should handle missing session gracefully', () => {
      const chatId = '999';
      sessionRepository.getSession.mockReturnValue(null);

      expect(() =>
        orchestrator.addMessage(chatId, MessageRole.USER, 'test')
      ).not.toThrow();
    });

    it('should maintain conversation order', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      orchestrator.addMessage(chatId, MessageRole.USER, 'Question 1');
      orchestrator.addMessage(chatId, MessageRole.ASSISTANT, 'Answer 1');
      orchestrator.addMessage(chatId, MessageRole.USER, 'Question 2');

      expect(activeSession.conversationHistory).toHaveLength(3);
      expect(activeSession.conversationHistory[0].content).toBe('Question 1');
      expect(activeSession.conversationHistory[1].content).toBe('Answer 1');
      expect(activeSession.conversationHistory[2].content).toBe('Question 2');
    });
  });

  describe('getConversationHistory', () => {
    it('should return conversation history for active session', () => {
      const chatId = '123';
      const activeSession: ChatSession = {
        ...createMockSession(),
        conversationHistory: [
          {
            role: MessageRole.USER,
            content: 'Test message',
            timestamp: new Date(),
          },
        ],
      };
      sessionRepository.getSession.mockReturnValue(activeSession);

      const history = orchestrator.getConversationHistory(chatId);

      expect(history).toEqual(activeSession.conversationHistory);
    });

    it('should return empty array when no session exists', () => {
      const chatId = '999';
      sessionRepository.getSession.mockReturnValue(null);

      const history = orchestrator.getConversationHistory(chatId);

      expect(history).toEqual([]);
    });
  });

  describe('getSessionStatus', () => {
    it('should return session status', () => {
      const chatId = '123';
      const mockSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(mockSession);

      const status = orchestrator.getSessionStatus(chatId);

      expect(status).toBe(SessionStatus.ACTIVE);
    });

    it('should return null when no session exists', () => {
      const chatId = '999';
      sessionRepository.getSession.mockReturnValue(null);

      const status = orchestrator.getSessionStatus(chatId);

      expect(status).toBeNull();
    });
  });

  describe('Session Persistence', () => {
    it('should persist session across multiple workflows', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession.mockReturnValue(activeSession);

      // First workflow
      orchestrator.trackWorkflow(chatId, 'full_analysis', 'AAPL');

      // Add conversation
      orchestrator.addMessage(chatId, MessageRole.USER, 'What is the P/E?');
      orchestrator.addMessage(chatId, MessageRole.ASSISTANT, 'P/E is 28.5');

      // Second workflow
      orchestrator.trackWorkflow(chatId, 'full_analysis', 'MSFT');

      expect(activeSession.workflows).toHaveLength(2);
      expect(activeSession.conversationHistory).toHaveLength(2);
      expect(activeSession.status).toBe(SessionStatus.ACTIVE);
    });

    it('should create fresh session after stop', () => {
      const chatId = '123';
      const activeSession = createMockSession();
      sessionRepository.getSession
        .mockReturnValueOnce(activeSession)
        .mockReturnValueOnce({
          ...createMockSession(),
          status: SessionStatus.STOPPED,
        });

      // Stop session
      orchestrator.stopSession(chatId);

      // Get or create should create new session
      const newSession = orchestrator.getOrCreateSession(chatId);

      expect(newSession.sessionId).not.toBe(activeSession.sessionId);
      expect(newSession.conversationHistory).toEqual([]);
      expect(newSession.workflows).toEqual([]);
    });
  });
});
