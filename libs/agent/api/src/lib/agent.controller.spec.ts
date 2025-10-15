/**
 * AgentController Tests
 * Tests for workflow and conversation SSE endpoints
 */

// Mock Anthropic SDK before any imports
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
  createSdkMcpServer: jest.fn(),
  tool: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentService, AgentStreamService } from '@stock-analyzer/agent/core';
import { WorkflowType, StreamEventType } from '@stock-analyzer/shared/types';
import { Request, Response } from 'express';

describe('AgentController', () => {
  let controller: AgentController;
  let agentService: jest.Mocked<AgentService>;
  let streamService: jest.Mocked<AgentStreamService>;

  // Mock Response object with SSE methods
  const createMockResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      write: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  // Mock Request object with event listeners
  const createMockRequest = () => {
    const listeners: Record<string, Function[]> = {};
    const req = {
      on: jest.fn((event: string, callback: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
        return req;
      }),
      emit: (event: string, ...args: unknown[]) => {
        if (listeners[event]) {
          listeners[event].forEach((cb) => cb(...args));
        }
      },
    } as unknown as Request;
    return req;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: {
            executeWorkflow: jest.fn(),
            executeConversation: jest.fn(),
          },
        },
        {
          provide: AgentStreamService,
          useValue: {
            registerStream: jest.fn(),
            closeStream: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    agentService = module.get(AgentService) as jest.Mocked<AgentService>;
    streamService = module.get(
      AgentStreamService
    ) as jest.Mocked<AgentStreamService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeWorkflow', () => {
    it('should return SSE stream with correct headers', async () => {
      const sessionId = 'test-session-123';
      const ticker = 'AAPL';
      const body = {
        sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: {
          ticker,
          userPrompt: 'Analyze AAPL',
        },
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeWorkflow.mockResolvedValue({
        sessionId,
        ticker,
        timestamp: new Date().toISOString(),
        executiveSummary: 'Test summary',
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType: WorkflowType.FULL_ANALYSIS,
          model: 'claude-sonnet-4',
          duration: 5000,
        },
      });

      await controller.executeWorkflow(body, req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream'
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });

    it('should register SSE stream', async () => {
      const sessionId = 'test-session-register';
      const body = {
        sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: { ticker: 'AAPL', userPrompt: 'Test' },
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeWorkflow.mockResolvedValue({
        sessionId,
        ticker: 'AAPL',
        timestamp: new Date().toISOString(),
        executiveSummary: '',
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType: WorkflowType.FULL_ANALYSIS,
          model: 'test-model',
          duration: 1000,
        },
      });

      await controller.executeWorkflow(body, req, res);

      expect(streamService.registerStream).toHaveBeenCalledWith(sessionId, res);
    });

    it('should send connected event', async () => {
      const sessionId = 'test-session-connected';
      const ticker = 'MSFT';
      const body = {
        sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: { ticker, userPrompt: 'Test' },
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeWorkflow.mockResolvedValue({
        sessionId,
        ticker,
        timestamp: new Date().toISOString(),
        executiveSummary: '',
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType: WorkflowType.FULL_ANALYSIS,
          model: 'test-model',
          duration: 1000,
        },
      });

      await controller.executeWorkflow(body, req, res);

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"connected"')
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining(`"sessionId":"${sessionId}"`)
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining(`"ticker":"${ticker}"`)
      );
    });

    it('should execute workflow via AgentService', async () => {
      const sessionId = 'test-session-execute';
      const ticker = 'GOOGL';
      const workflowType = WorkflowType.FULL_ANALYSIS;
      const body = {
        sessionId,
        workflowType,
        params: { ticker, userPrompt: 'Analyze stock' },
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeWorkflow.mockResolvedValue({
        sessionId,
        ticker,
        timestamp: new Date().toISOString(),
        executiveSummary: 'Analysis result',
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType,
          model: 'test-model',
          duration: 3000,
        },
      });

      await controller.executeWorkflow(body, req, res);

      expect(agentService.executeWorkflow).toHaveBeenCalledWith(
        sessionId,
        workflowType,
        body.params
      );
    });

    it('should handle workflow error and send error event', async () => {
      const sessionId = 'test-session-error';
      const body = {
        sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: { ticker: 'INVALID', userPrompt: 'Test' },
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeWorkflow.mockRejectedValue(
        new Error('Workflow failed')
      );

      await controller.executeWorkflow(body, req, res);

      // Wait for promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('Workflow failed')
      );
      expect(streamService.closeStream).toHaveBeenCalledWith(sessionId);
    });

    it('should cleanup on client disconnect', async () => {
      const sessionId = 'test-session-disconnect';
      const body = {
        sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: { ticker: 'AAPL', userPrompt: 'Test' },
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeWorkflow.mockResolvedValue({
        sessionId,
        ticker: 'AAPL',
        timestamp: new Date().toISOString(),
        executiveSummary: '',
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType: WorkflowType.FULL_ANALYSIS,
          model: 'test-model',
          duration: 1000,
        },
      });

      await controller.executeWorkflow(body, req, res);

      // Simulate client disconnect
      (req as any).emit('close');

      expect(streamService.closeStream).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('executeConversation', () => {
    it('should return SSE stream with correct headers', async () => {
      const sessionId = 'test-conv-123';
      const body = {
        sessionId,
        userMessage: 'What is the P/E ratio?',
        conversationHistory: [],
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeConversation.mockResolvedValue('P/E is 28.5...');

      await controller.executeConversation(body, req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream'
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });

    it('should register SSE stream for conversation', async () => {
      const sessionId = 'test-conv-register';
      const body = {
        sessionId,
        userMessage: 'Test question',
        conversationHistory: [],
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeConversation.mockResolvedValue('Test answer');

      await controller.executeConversation(body, req, res);

      expect(streamService.registerStream).toHaveBeenCalledWith(sessionId, res);
    });

    it('should send connected event', async () => {
      const sessionId = 'test-conv-connected';
      const body = {
        sessionId,
        userMessage: 'Test',
        conversationHistory: [],
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeConversation.mockResolvedValue('Response');

      await controller.executeConversation(body, req, res);

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"connected"')
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining(`"sessionId":"${sessionId}"`)
      );
    });

    it('should execute conversation with history', async () => {
      const sessionId = 'test-conv-history';
      const userMessage = 'What about MSFT?';
      const conversationHistory = [
        { role: 'user' as const, content: 'Tell me about AAPL', timestamp: '2025-01-01T00:00:00Z' },
        { role: 'assistant' as const, content: 'AAPL is Apple Inc.', timestamp: '2025-01-01T00:00:01Z' },
      ];
      const body = {
        sessionId,
        userMessage,
        conversationHistory,
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeConversation.mockResolvedValue('MSFT is Microsoft...');

      await controller.executeConversation(body, req, res);

      expect(agentService.executeConversation).toHaveBeenCalledWith(
        sessionId,
        userMessage,
        conversationHistory
      );
    });

    it('should handle conversation error and send error event', async () => {
      const sessionId = 'test-conv-error';
      const body = {
        sessionId,
        userMessage: 'Test',
        conversationHistory: [],
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeConversation.mockRejectedValue(
        new Error('Conversation failed')
      );

      await controller.executeConversation(body, req, res);

      // Wait for promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('Conversation failed')
      );
      expect(streamService.closeStream).toHaveBeenCalledWith(sessionId);
    });

    it('should cleanup on client disconnect', async () => {
      const sessionId = 'test-conv-disconnect';
      const body = {
        sessionId,
        userMessage: 'Test',
        conversationHistory: [],
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeConversation.mockResolvedValue('Response');

      await controller.executeConversation(body, req, res);

      // Simulate client disconnect
      (req as any).emit('close');

      expect(streamService.closeStream).toHaveBeenCalledWith(sessionId);
    });

    it('should handle empty conversation history', async () => {
      const sessionId = 'test-conv-empty';
      const userMessage = 'First question';
      const body = {
        sessionId,
        userMessage,
        conversationHistory: [],
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeConversation.mockResolvedValue('First answer');

      await controller.executeConversation(body, req, res);

      expect(agentService.executeConversation).toHaveBeenCalledWith(
        sessionId,
        userMessage,
        []
      );
    });
  });

  describe('SSE Format', () => {
    it('should format SSE events correctly', async () => {
      const sessionId = 'test-sse-format';
      const body = {
        sessionId,
        workflowType: WorkflowType.FULL_ANALYSIS,
        params: { ticker: 'AAPL', userPrompt: 'Test' },
      };

      const res = createMockResponse();
      const req = createMockRequest();

      agentService.executeWorkflow.mockResolvedValue({
        sessionId,
        ticker: 'AAPL',
        timestamp: new Date().toISOString(),
        executiveSummary: '',
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType: WorkflowType.FULL_ANALYSIS,
          model: 'test-model',
          duration: 1000,
        },
      });

      await controller.executeWorkflow(body, req, res);

      // Verify SSE format: data: {...}\n\n
      const writeCall = res.write as jest.Mock;
      const sseMessage = writeCall.mock.calls[0][0] as string;

      expect(sseMessage).toMatch(/^data: \{.*\}\n\n$/);
      expect(() => JSON.parse(sseMessage.slice(6, -2))).not.toThrow();
    });
  });
});
