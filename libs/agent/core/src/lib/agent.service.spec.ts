/**
 * Baseline tests for AgentService
 * Tests current behavior before refactoring
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentService } from './agent.service';
import { MockSDKStream } from '../test-utils/mock-sdk-stream';
import { SessionManagerService } from '@stock-analyzer/agent/session';
import { HooksService } from '@stock-analyzer/agent/hooks';

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
            dataTypes: { type: 'array', items: { type: 'string' } },
          },
          required: ['ticker'],
        },
      },
    ]),
    executeTool: jest.fn((name, args) =>
      Promise.resolve({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: { ticker: args.ticker },
            }),
          },
        ],
      })
    ),
  })),
}));

describe('AgentService - Baseline Tests', () => {
  let service: AgentService;
  let configService: ConfigService;
  let eventEmitter: EventEmitter2;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    // Reset mocks
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
            buildContextPrompt: jest.fn(),
          },
        },
        {
          provide: HooksService,
          useValue: {
            createOnMessageHook: jest.fn(() => jest.fn()),
            createOnToolUseHook: jest.fn(() => jest.fn()),
            createOnToolResultHook: jest.fn(() => jest.fn()),
          },
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
    configService = module.get<ConfigService>(ConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should throw error if ANTHROPIC_API_KEY is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            AgentService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => undefined),
              },
            },
            {
              provide: EventEmitter2,
              useValue: { emit: jest.fn() },
            },
            {
              provide: SessionManagerService,
              useValue: { createSession: jest.fn() },
            },
            {
              provide: HooksService,
              useValue: { createOnMessageHook: jest.fn() },
            },
          ],
        }).compile()
      ).rejects.toThrow('ANTHROPIC_API_KEY environment variable is required');
    });

    it('should initialize tool registry and MCP server', async () => {
      expect(service).toBeDefined();
      // Verify SDK server was created
      const { createSdkMcpServer } = await import('@anthropic-ai/claude-agent-sdk');
      expect(createSdkMcpServer).toHaveBeenCalled();
    });
  });

  describe('analyzeStock()', () => {
    it('should analyze stock and return result', async () => {
      // Mock SDK stream
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Analysis for AAPL...'),
        ])
      );

      const result = await service.analyzeStock(
        'AAPL',
        'Analyze AAPL stock'
      );

      expect(result).toMatchObject({
        ticker: 'AAPL',
        executiveSummary: 'Analysis for AAPL...',
        metadata: expect.objectContaining({
          framework: expect.any(String),
          model: expect.any(String),
          duration: expect.any(Number),
        }),
      });
    });

    it('should emit chunk events during streaming', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('First chunk'),
          MockSDKStream.createAssistantMessage('Second chunk'),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.chunk.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          content: expect.any(String),
        })
      );
    });

    it('should emit tool events when tools are called', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createToolUseMessage(
            'mcp__stock-analyzer__fetch_company_data',
            { ticker: 'AAPL' },
            'toolu_001'
          ),
          MockSDKStream.createToolResultMessage('toolu_001', '{"success": true}'),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.tool.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          toolName: 'mcp__stock-analyzer__fetch_company_data',
          toolId: 'toolu_001',
        })
      );
    });

    it('should emit complete event at end', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Analysis complete'),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.complete.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          metadata: expect.any(Object),
        })
      );
    });

    it('should handle SDK errors gracefully', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      await expect(
        service.analyzeStock('AAPL', 'Analyze AAPL')
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Message Type Handling', () => {
    it('should process assistant messages', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Test content', {
            stopReason: 'end_turn',
            usage: { input_tokens: 1000, output_tokens: 500 },
          }),
        ])
      );

      const result = await service.analyzeStock(
        'AAPL',
        'Analyze AAPL',
        undefined,
        sessionId
      );

      expect(result.executiveSummary).toContain('Test content');
    });

    it('should process thinking messages', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createThinkingMessage('Analyzing data...'),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.thinking.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          message: 'Analyzing data...',
        })
      );
    });

    it('should process tool use messages', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createToolUseMessage(
            'fetch_company_data',
            { ticker: 'AAPL' }
          ),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.tool.${sessionId}`,
        expect.any(Object)
      );
    });

    it('should process tool result messages', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createToolUseMessage('fetch_company_data', { ticker: 'AAPL' }, 'toolu_001'),
          MockSDKStream.createToolResultMessage('toolu_001', '{"success": true}'),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.tool_result.${sessionId}`,
        expect.objectContaining({
          toolId: 'toolu_001',
        })
      );
    });
  });

  describe('PDF Handling', () => {
    it('should emit PDF event when PDF is generated', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createToolUseMessage(
            'mcp__stock-analyzer__generate_pdf',
            { ticker: 'AAPL', reportType: 'summary' },
            'toolu_pdf_001'
          ),
          MockSDKStream.createToolResultMessage(
            'toolu_pdf_001',
            JSON.stringify({
              success: true,
              ticker: 'AAPL',
              pdfBase64: 'base64data',
              fileSize: 12345,
              reportType: 'summary',
            })
          ),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.pdf.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          pdfBase64: 'base64data',
          fileSize: 12345,
          reportType: 'summary',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle stream processing errors', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('Stream error');
      });

      await expect(
        service.analyzeStock('AAPL', 'Analyze AAPL')
      ).rejects.toThrow('Stream error');
    });

    it('should continue processing after message error', async () => {
      const sessionId = 'test-session-123';

      // Create a stream with a malformed message followed by a valid one
      mockQuery.mockReturnValue(
        (async function* () {
          yield { type: 'invalid', data: 'bad' } as any;
          yield MockSDKStream.createAssistantMessage('Valid content');
        })()
      );

      const result = await service.analyzeStock(
        'AAPL',
        'Analyze AAPL',
        undefined,
        sessionId
      );

      // Should still get valid content despite error
      expect(result.executiveSummary).toContain('Valid content');
    });
  });

  describe('Event Emission', () => {
    it('should emit events with correct structure', async () => {
      const sessionId = 'test-session-123';

      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Test'),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL', undefined, sessionId);

      // Verify chunk event structure
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.chunk.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          content: expect.any(String),
          phase: 'executive-summary',
          timestamp: expect.any(String),
        })
      );

      // Verify complete event structure
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        `analysis.complete.${sessionId}`,
        expect.objectContaining({
          ticker: 'AAPL',
          metadata: expect.objectContaining({
            analysisDate: expect.any(String),
            framework: expect.any(String),
            model: expect.any(String),
            duration: expect.any(Number),
          }),
        })
      );
    });

    it('should not emit events when sessionId is undefined', async () => {
      mockQuery.mockReturnValue(
        MockSDKStream.createStream([
          MockSDKStream.createAssistantMessage('Test'),
        ])
      );

      await service.analyzeStock('AAPL', 'Analyze AAPL');

      // Should not emit chunk events without sessionId
      const chunkCalls = (eventEmitter.emit as jest.Mock).mock.calls.filter(
        (call) => call[0].includes('chunk')
      );
      expect(chunkCalls).toHaveLength(0);
    });
  });
});
