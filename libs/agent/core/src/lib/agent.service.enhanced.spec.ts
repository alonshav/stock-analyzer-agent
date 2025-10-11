/**
 * Comprehensive tests for Enhanced AgentService
 * Tests new features: handleConversation, hooks integration, all 7 SDK message types
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentService } from './agent.service';
import { MockSDKStream } from '../test-utils/mock-sdk-stream';
import { SessionManagerService } from '@stock-analyzer/agent/session';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
  createSdkMcpServer: jest.fn(() => ({ name: 'mock-server' })),
  tool: jest.fn((name, desc, schema, handler) => ({
    name,
    description: desc,
    inputSchema: schema,
    handler,
  })),
}));

// Mock the tool registry
jest.mock('@stock-analyzer/mcp/tools', () => ({
  createToolRegistry: jest.fn(() => ({
    getTools: jest.fn(() => [
      {
        name: 'fetch_company_data',
        description: 'Fetch company data',
        inputSchema: {
          type: 'object',
          properties: {
            ticker: { type: 'string' },
          },
          required: ['ticker'],
        },
      },
    ]),
    executeTool: jest.fn(() =>
      Promise.resolve({
        content: [{ type: 'text', text: '{"success": true}' }],
      })
    ),
  })),
}));

describe('AgentService - Enhanced Features', () => {
  let service: AgentService;
  let sessionManager: SessionManagerService;
  let eventEmitter: EventEmitter2;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    mockQuery = query as jest.Mock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test-key';
              if (key === 'ANTHROPIC_MODEL') return 'claude-sonnet-4-20250514';
              if (key === 'ANTHROPIC_MAX_TURNS') return '20';
              return undefined;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: SessionManagerService,
          useValue: {
            createSession: jest.fn((chatId, ticker) => ({
              sessionId: `${ticker}-${Date.now()}`,
              ticker,
              chatId,
              status: 'active',
              startedAt: new Date(),
              lastActivity: new Date(),
              expiresAt: new Date(Date.now() + 3600000),
              conversationHistory: [],
              metrics: { tokens: 0, toolCalls: 0, turns: 0, errors: 0 },
            })),
            getActiveSession: jest.fn(),
            completeSession: jest.fn(),
            stopSession: jest.fn(),
            addMessage: jest.fn(),
            buildContextPrompt: jest.fn((chatId, message) => `Context: ${message}`),
          },
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
    sessionManager = module.get<SessionManagerService>(SessionManagerService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('handleConversation()', () => {
    it('should throw error if no active session exists', async () => {
      (sessionManager.getActiveSession as jest.Mock).mockReturnValue(null);

      await expect(
        service.handleConversation('chat123', 'What is the P/E ratio?')
      ).rejects.toThrow('No active session for conversation');
    });

    it('should build context prompt from session', async () => {
      const mockSession = {
        sessionId: 'session-123',
        ticker: 'AAPL',
        chatId: 'chat123',
        status: 'active',
        conversationHistory: [
          { role: 'user', content: 'Analyze AAPL', timestamp: new Date() },
          { role: 'assistant', content: 'Analysis...', timestamp: new Date() },
        ],
      };

      (sessionManager.getActiveSession as jest.Mock).mockReturnValue(mockSession);
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('P/E ratio is 28.5'),
        ])
      );

      await service.handleConversation('chat123', 'What is the P/E ratio?');

      expect(sessionManager.buildContextPrompt).toHaveBeenCalledWith(
        'chat123',
        'What is the P/E ratio?'
      );
    });

    it('should save user and assistant messages to session', async () => {
      const mockSession = {
        sessionId: 'session-123',
        ticker: 'AAPL',
        chatId: 'chat123',
        status: 'active',
      };

      (sessionManager.getActiveSession as jest.Mock).mockReturnValue(mockSession);
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('P/E ratio is 28.5'),
        ])
      );

      const userMessage = 'What is the P/E ratio?';
      await service.handleConversation('chat123', userMessage);

      // Verify messages were saved
      expect(sessionManager.addMessage).toHaveBeenCalledWith(
        'chat123',
        'user',
        userMessage
      );
      expect(sessionManager.addMessage).toHaveBeenCalledWith(
        'chat123',
        'assistant',
        'P/E ratio is 28.5'
      );
    });

    it('should stream response with sessionId', async () => {
      const mockSession = {
        sessionId: 'session-123',
        ticker: 'AAPL',
        chatId: 'chat123',
        status: 'active',
      };

      (sessionManager.getActiveSession as jest.Mock).mockReturnValue(mockSession);
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Answer here'),
        ])
      );

      await service.handleConversation('chat123', 'Question?');

      // Should emit chunk events with session ID
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'analysis.chunk.session-123',
        expect.objectContaining({
          ticker: 'AAPL',
          content: 'Answer here',
          phase: 'conversation',
        })
      );
    });

    it('should return assistant response', async () => {
      const mockSession = {
        sessionId: 'session-123',
        ticker: 'AAPL',
        chatId: 'chat123',
        status: 'active',
      };

      (sessionManager.getActiveSession as jest.Mock).mockReturnValue(mockSession);
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('This is the answer'),
        ])
      );

      const result = await service.handleConversation('chat123', 'Question?');

      expect(result).toBe('This is the answer');
    });
  });

  describe('Session Integration', () => {
    it('should create session when starting analysis', async () => {
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Analysis'),
        ])
      );

      await service.analyzeStock('chat123', 'AAPL', 'Analyze', undefined, 'session-123');

      expect(sessionManager.createSession).toHaveBeenCalledWith('chat123', 'AAPL');
    });

    it('should complete session after successful analysis', async () => {
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Executive summary here'),
        ])
      );

      await service.analyzeStock('chat123', 'AAPL', 'Analyze', undefined, 'session-123');

      expect(sessionManager.completeSession).toHaveBeenCalledWith(
        'chat123',
        'Executive summary here',
        'Executive summary here'
      );
    });

    it('should stop session on analysis error', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      await expect(
        service.analyzeStock('chat123', 'AAPL', 'Analyze', undefined, 'session-123')
      ).rejects.toThrow('Analysis failed');

      expect(sessionManager.stopSession).toHaveBeenCalledWith('chat123');
    });

    it('should pass chatId to createSession', async () => {
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Analysis'),
        ])
      );

      await service.analyzeStock('chat123', 'AAPL', 'Analyze stock');

      expect(sessionManager.createSession).toHaveBeenCalledWith('chat123', 'AAPL');
    });
  });


  describe('All 7 SDK Message Types', () => {
    it('should handle SDKResultMessage with metadata', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        (async function* () {
          yield MockSDKStream.createResultMessage({
            executionTimeMs: 5000,
            costUsd: 0.25,
            totalTokens: 10000,
          });
        })()
      );

      await service.analyzeStock('test-chat-1', 'AAPL', 'Analyze', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.result.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          success: true,
          executionTime: 5000,
          cost: 0.25,
          totalTokens: 10000,
        })
      );
    });

    it('should handle SDKSystemMessage with init subtype', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            model: 'claude-sonnet-4-20250514',
            permissionMode: 'bypassPermissions',
          } as any;
          yield MockSDKStream.createAssistantMessage('Done');
        })()
      );

      await service.analyzeStock('test-chat-1', 'AAPL', 'Analyze', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.system.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          model: 'claude-sonnet-4-20250514',
          permissionMode: 'bypassPermissions',
        })
      );
    });

    it('should handle SDKSystemMessage with compact_boundary subtype', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'system',
            subtype: 'compact_boundary',
            trigger: 'token_limit',
            originalMessageCount: 100,
            compactedMessageCount: 50,
          } as any;
          yield MockSDKStream.createAssistantMessage('Done');
        })()
      );

      await service.analyzeStock('test-chat-1', 'AAPL', 'Analyze', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.compaction.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          trigger: 'token_limit',
          messagesBefore: 100,
          messagesAfter: 50,
        })
      );
    });

    it('should handle SDKPartialAssistantMessage (stream_event)', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'stream_event',
            partialText: 'Partial content...',
          } as any;
          yield MockSDKStream.createAssistantMessage('Full content');
        })()
      );

      await service.analyzeStock('test-chat-1', 'AAPL', 'Analyze', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.partial.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          partialContent: 'Partial content...',
        })
      );
    });

    it('should handle multiple message types in sequence', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        (async function* () {
          // System init
          yield { type: 'system', subtype: 'init', model: 'claude-sonnet-4' } as any;
          // Assistant thinking
          yield MockSDKStream.createThinkingMessage('Analyzing...');
          // Tool use
          yield MockSDKStream.createToolUseMessage('fetch_company_data', { ticker: 'AAPL' }, 'tool1');
          // Tool result
          yield MockSDKStream.createToolResultMessage('tool1', '{"success": true}');
          // Assistant response
          yield MockSDKStream.createAssistantMessage('Analysis complete');
          // Result
          yield MockSDKStream.createResultMessage({});
        })()
      );

      await service.analyzeStock('test-chat-1', 'AAPL', 'Analyze', undefined, sessionId);

      // Verify all event types were emitted
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.system.${sessionId}`,
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.thinking.${sessionId}`,
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.tool.${sessionId}`,
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.tool_result.${sessionId}`,
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.chunk.${sessionId}`,
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.result.${sessionId}`,
        expect.any(Object)
      );
    });

    it('should log warning for unknown message types', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'warn');

      mockQuery.mockReturnValue(
        (async function* () {
          yield { type: 'unknown_type', data: 'test' } as any;
          yield MockSDKStream.createAssistantMessage('Done');
        })()
      );

      await service.analyzeStock('test-chat-1', 'AAPL', 'Analyze');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type: unknown_type')
      );
    });
  });

  describe('Error Resilience', () => {
    it('should continue processing messages after individual message errors', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'error');

      mockQuery.mockReturnValue(
        (async function* () {
          // This will cause an error when processing
          yield { type: 'assistant', message: null } as any;
          // Valid message should still be processed
          yield MockSDKStream.createAssistantMessage('Valid content');
        })()
      );

      const result = await service.analyzeStock('test-chat-1', 'AAPL', 'Analyze', undefined, 'session-123');

      expect(result.executiveSummary).toContain('Valid content');
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing message'),
        expect.any(Error)
      );
    });

  });
});
