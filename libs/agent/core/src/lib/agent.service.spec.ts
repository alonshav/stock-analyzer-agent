/**
 * AgentService Tests
 * Tests for stateless workflow execution with event emission
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentService, AnalysisResult } from './agent.service';
import { WorkflowService } from './workflows';
import { StreamEventType, WorkflowType } from '@stock-analyzer/shared/types';

// Mock the Anthropic SDK
const mockQuery = jest.fn();
const mockCreateSdkMcpServer = jest.fn();
const mockTool = jest.fn();

jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: any[]) => mockQuery(...args),
  createSdkMcpServer: (...args: any[]) => mockCreateSdkMcpServer(...args),
  tool: (...args: any[]) => mockTool(...args),
}));

// Mock the tool registry
const mockToolRegistry = {
  getTools: jest.fn(() => [
    {
      name: 'mcp__stock-analyzer__fetch_company_data',
      description: 'Fetch company data',
      inputSchema: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
        },
        required: ['ticker'],
      },
    },
    {
      name: 'mcp__stock-analyzer__calculate_dcf',
      description: 'Calculate DCF',
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
      content: [{ type: 'text', text: '{"success": true, "data": {}}' }],
    })
  ),
};

jest.mock('@stock-analyzer/mcp/tools', () => ({
  createToolRegistry: () => mockToolRegistry,
}));

describe('AgentService', () => {
  let service: AgentService;
  let eventEmitter: EventEmitter2;
  let workflowService: WorkflowService;
  let emitSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup SDK mocks
    mockTool.mockImplementation((name, desc, schema, handler) => ({
      name,
      description: desc,
      inputSchema: schema,
      handler,
    }));

    mockCreateSdkMcpServer.mockReturnValue({
      name: 'stock-analyzer-tools',
      version: '1.0.0',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test-key';
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
          provide: WorkflowService,
          useValue: {
            buildUserPrompt: jest.fn((workflowType, params) => {
              return `Analyze ${params.ticker}`;
            }),
            getConfig: jest.fn((workflowType) => ({
              systemPrompt: 'You are a stock analyst',
              model: 'claude-sonnet-4-20250514',
              maxThinkingTokens: 10000,
              maxTurns: 20,
            })),
          },
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    workflowService = module.get<WorkflowService>(WorkflowService);
    emitSpy = jest.spyOn(eventEmitter, 'emit');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should setup tool registry and MCP server', () => {
      expect(mockToolRegistry.getTools).toHaveBeenCalled();
      expect(mockTool).toHaveBeenCalledTimes(2); // 2 tools
      expect(mockCreateSdkMcpServer).toHaveBeenCalledWith({
        name: 'stock-analyzer-tools',
        version: '1.0.0',
        tools: expect.any(Array),
      });
    });

    it('should convert MCP tools to SDK tools with handlers', () => {
      // Verify tool conversion happened correctly
      const toolCalls = mockTool.mock.calls;
      expect(toolCalls).toHaveLength(2);

      // First tool
      expect(toolCalls[0][0]).toBe('mcp__stock-analyzer__fetch_company_data');
      expect(toolCalls[0][1]).toBe('Fetch company data');
      expect(toolCalls[0][3]).toBeInstanceOf(Function); // handler

      // Second tool
      expect(toolCalls[1][0]).toBe('mcp__stock-analyzer__calculate_dcf');
      expect(toolCalls[1][1]).toBe('Calculate DCF');
      expect(toolCalls[1][3]).toBeInstanceOf(Function); // handler
    });
  });

  describe('executeWorkflow', () => {
    it('should execute workflow and return analysis result', async () => {
      const sessionId = 'test-session-123';
      const ticker = 'AAPL';

      // Mock SDK stream with assistant message
      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Apple Inc. shows strong fundamentals...',
                },
              ],
            },
          };
        })()
      );

      const result = await service.executeWorkflow(
        sessionId,
        WorkflowType.FULL_ANALYSIS,
        { ticker, userPrompt: 'Analyze AAPL' }
      );

      expect(result).toMatchObject({
        sessionId,
        ticker,
        executiveSummary: 'Apple Inc. shows strong fundamentals...',
        metadata: {
          workflowType: WorkflowType.FULL_ANALYSIS,
          model: 'claude-sonnet-4-20250514',
        },
      });
    });

    it('should build user prompt using WorkflowService', async () => {
      const sessionId = 'test-session-123';
      const ticker = 'MSFT';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Analysis' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Custom prompt',
      });

      expect(workflowService.buildUserPrompt).toHaveBeenCalledWith(
        WorkflowType.FULL_ANALYSIS,
        { ticker, userPrompt: 'Custom prompt' }
      );
    });

    it('should emit COMPLETE event with metadata', async () => {
      const sessionId = 'test-session-complete';
      const ticker = 'GOOGL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Analysis done' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Analyze',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.COMPLETE,
          sessionId,
          ticker,
          metadata: expect.objectContaining({
            workflowType: WorkflowType.FULL_ANALYSIS,
            model: 'claude-sonnet-4-20250514',
            duration: expect.any(Number),
          }),
        })
      );
    });

    it('should emit ERROR event on failure', async () => {
      const sessionId = 'test-session-error';
      const ticker = 'INVALID';

      mockQuery.mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      await expect(
        service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
          ticker,
          userPrompt: 'Analyze',
        })
      ).rejects.toThrow('Analysis failed');

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.ERROR,
          sessionId,
          message: 'Analysis failed',
        })
      );
    });
  });

  describe('Event Emissions', () => {
    it('should emit SYSTEM event on initialization', async () => {
      const sessionId = 'test-session-system';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            model: 'claude-sonnet-4-20250514',
            permissionMode: 'bypassPermissions',
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Done' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.SYSTEM,
          sessionId,
          ticker,
          model: 'claude-sonnet-4-20250514',
          permissionMode: 'bypassPermissions',
        })
      );
    });

    it('should emit COMPACTION event on compact_boundary', async () => {
      const sessionId = 'test-session-compact';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'system',
            subtype: 'compact_boundary',
            compact_metadata: {
              trigger: 'auto',
              pre_tokens: 50000,
            },
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Done' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.COMPACTION,
          sessionId,
          ticker,
          trigger: 'auto',
          messagesBefore: 50000,
        })
      );
    });

    it('should emit PARTIAL event on stream_event', async () => {
      const sessionId = 'test-session-partial';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              delta: {
                type: 'text_delta',
                text: 'Partial text...',
              },
            },
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Full text' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.PARTIAL,
          sessionId,
          ticker,
          partialContent: 'Partial text...',
          deltaType: 'text',
        })
      );
    });

    it('should emit THINKING event for thinking blocks', async () => {
      const sessionId = 'test-session-thinking';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking: 'Let me analyze this...',
                },
                {
                  type: 'text',
                  text: 'Analysis result',
                },
              ],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.THINKING,
          sessionId,
          ticker,
          message: 'Let me analyze this...',
        })
      );
    });

    it('should emit TOOL event for tool use blocks', async () => {
      const sessionId = 'test-session-tool';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_123',
                  name: 'mcp__stock-analyzer__fetch_company_data',
                  input: { ticker: 'AAPL' },
                },
              ],
            },
          };
          yield {
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool_123',
                  content: [{ type: 'text', text: '{"success": true}' }],
                },
              ],
            },
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Done' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.TOOL,
          sessionId,
          ticker,
          toolName: 'mcp__stock-analyzer__fetch_company_data',
          toolId: 'tool_123',
          toolInput: { ticker: 'AAPL' },
        })
      );
    });

    it('should emit CHUNK event for text content', async () => {
      const sessionId = 'test-session-chunk';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Apple Inc. analysis content',
                },
              ],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.CHUNK,
          sessionId,
          ticker,
          content: 'Apple Inc. analysis content',
          phase: WorkflowType.FULL_ANALYSIS,
        })
      );
    });

    it('should emit TOOL_RESULT event after tool execution', async () => {
      const sessionId = 'test-session-tool-result';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_456',
                  name: 'fetch_data',
                  input: {},
                },
              ],
            },
          };
          yield {
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool_456',
                  content: [{ type: 'text', text: '{"data": "test"}' }],
                },
              ],
            },
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Done' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.TOOL_RESULT,
          sessionId,
          ticker,
          toolId: 'tool_456',
        })
      );
    });

    it('should emit RESULT event with execution metadata', async () => {
      const sessionId = 'test-session-result';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Analysis' }],
              usage: {
                input_tokens: 1000,
                output_tokens: 500,
              },
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
            duration_ms: 5000,
            total_cost_usd: 0.25,
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.RESULT,
          sessionId,
          ticker,
          success: true,
          executionTime: 5000,
          cost: 0.25,
        })
      );
    });

    it('should emit PDF event when PDF tool result is processed', async () => {
      const sessionId = 'test-session-pdf';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'pdf_tool_123',
                  name: 'mcp__stock-analyzer__generate_pdf',
                  input: { content: 'test' },
                },
              ],
            },
          };
          yield {
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'pdf_tool_123',
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        success: true,
                        pdfBase64: 'base64encodedpdf==',
                        fileSize: 12345,
                        reportType: 'summary',
                      }),
                    },
                  ],
                },
              ],
            },
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'PDF generated' }],
            },
          };
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        `stream.${sessionId}`,
        expect.objectContaining({
          type: StreamEventType.PDF,
          sessionId,
          ticker,
          pdfBase64: 'base64encodedpdf==',
          fileSize: 12345,
          reportType: 'summary',
        })
      );
    });
  });

  describe('All Event Types Coverage', () => {
    it('should emit all 11 event types in a complete workflow', async () => {
      const sessionId = 'test-session-all-events';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          // 1. SYSTEM
          yield {
            type: 'system',
            subtype: 'init',
            model: 'claude-sonnet-4',
            permissionMode: 'bypassPermissions',
          };
          // 2. PARTIAL
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'Analyzing...' },
            },
          };
          // 3. THINKING
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: 'Let me think...' },
                // 4. TOOL
                {
                  type: 'tool_use',
                  id: 'tool1',
                  name: 'fetch_data',
                  input: {},
                },
              ],
            },
          };
          // 5. TOOL_RESULT
          yield {
            type: 'user',
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool1',
                  content: [{ type: 'text', text: '{"data": "test"}' }],
                },
              ],
            },
          };
          // 6. CHUNK (from text content)
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Analysis complete' }],
              usage: { input_tokens: 100, output_tokens: 50 },
            },
          };
          // 7. RESULT
          yield {
            type: 'result',
            subtype: 'success',
            duration_ms: 1000,
            total_cost_usd: 0.1,
          };
          // 8. COMPACTION (if it happens)
          // 9. ERROR (tested separately)
          // 10. PDF (tested separately)
          // 11. COMPLETE (emitted at end)
        })()
      );

      await service.executeWorkflow(sessionId, WorkflowType.FULL_ANALYSIS, {
        ticker,
        userPrompt: 'Test',
      });

      // Verify all emitted event types
      const emittedEventTypes = emitSpy.mock.calls
        .map((call) => call[1]?.type)
        .filter(Boolean);

      expect(emittedEventTypes).toContain(StreamEventType.SYSTEM);
      expect(emittedEventTypes).toContain(StreamEventType.PARTIAL);
      expect(emittedEventTypes).toContain(StreamEventType.THINKING);
      expect(emittedEventTypes).toContain(StreamEventType.TOOL);
      expect(emittedEventTypes).toContain(StreamEventType.TOOL_RESULT);
      expect(emittedEventTypes).toContain(StreamEventType.CHUNK);
      expect(emittedEventTypes).toContain(StreamEventType.RESULT);
      expect(emittedEventTypes).toContain(StreamEventType.COMPLETE);
    });
  });

  describe('Error Handling', () => {
    it('should continue processing after message processing error', async () => {
      const sessionId = 'test-session-error-resilience';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          // Invalid message that will cause error
          yield {
            type: 'assistant',
            message: null,
          };
          // Valid message should still be processed
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Valid content' }],
            },
          };
        })()
      );

      const result = await service.executeWorkflow(
        sessionId,
        WorkflowType.FULL_ANALYSIS,
        { ticker, userPrompt: 'Test' }
      );

      expect(result.executiveSummary).toBe('Valid content');
    });

    it('should handle unknown message types gracefully', async () => {
      const sessionId = 'test-session-unknown';
      const ticker = 'AAPL';

      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'unknown_type',
            data: 'test',
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Done' }],
            },
          };
        })()
      );

      const result = await service.executeWorkflow(
        sessionId,
        WorkflowType.FULL_ANALYSIS,
        { ticker, userPrompt: 'Test' }
      );

      expect(result.executiveSummary).toBe('Done');
    });
  });
});
