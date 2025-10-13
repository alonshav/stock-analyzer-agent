/**
 * AgentStreamService Tests
 * Tests for SSE stream management and event forwarding with sessionId extraction
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentStreamService } from './agent-stream.service';
import { StreamEventType } from '@stock-analyzer/shared/types';
import { Response } from 'express';

describe('AgentStreamService', () => {
  let service: AgentStreamService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentStreamService,
        {
          provide: EventEmitter2,
          useValue: {
            on: jest.fn(),
            off: jest.fn(),
            removeListener: jest.fn(),
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentStreamService>(AgentStreamService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    // Clean up any active streams
    service.onModuleDestroy();
  });

  describe('Module Lifecycle', () => {
    it('should setup event listeners in constructor', () => {
      expect(eventEmitter.on).toHaveBeenCalledWith(
        'stream.*',
        expect.any(Function)
      );
    });

    it('should cleanup listeners on destroy', () => {
      service.onModuleDestroy();
      expect(eventEmitter.off).toHaveBeenCalled();
    });
  });

  describe('Stream Management', () => {
    let mockResponse: Partial<Response>;

    beforeEach(() => {
      mockResponse = {
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        on: jest.fn(),
      };
    });

    it('should register stream for sessionId', () => {
      const sessionId = 'test-session-123';

      service.registerStream(sessionId, mockResponse as Response);

      expect(service.hasActiveStream(sessionId)).toBe(true);
      expect(service.getActiveStreamsCount()).toBe(1);
    });

    it('should setup connection close handlers', () => {
      const sessionId = 'test-session-123';

      service.registerStream(sessionId, mockResponse as Response);

      expect(mockResponse.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockResponse.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should close stream and remove from registry', () => {
      const sessionId = 'test-session-123';

      service.registerStream(sessionId, mockResponse as Response);
      service.closeStream(sessionId);

      expect(mockResponse.end).toHaveBeenCalled();
      expect(service.hasActiveStream(sessionId)).toBe(false);
    });

    it('should not error when closing non-existent stream', () => {
      expect(() => {
        service.closeStream('non-existent-session');
      }).not.toThrow();
    });
  });

  describe('Event Forwarding with sessionId Extraction', () => {
    let mockResponse: Partial<Response>;
    let eventListener: (payload: any) => void;

    beforeEach(() => {
      mockResponse = {
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        on: jest.fn(),
      };

      // Capture the event listener function (already registered in constructor)
      const onCalls = (eventEmitter.on as jest.Mock).mock.calls;
      const streamWildcardCall = onCalls.find(
        (call) => call[0] === 'stream.*'
      );
      eventListener = streamWildcardCall[1];
    });

    it('should extract sessionId from CHUNK event payload', () => {
      const sessionId = 'test-session-123';
      const ticker = 'AAPL';

      // Create stream first
      service.registerStream(sessionId, mockResponse as Response);

      // Simulate chunk event with sessionId in payload
      const chunkPayload = {
        type: StreamEventType.CHUNK,
        sessionId,
        ticker,
        content: 'Test content',
        phase: 'analysis',
        timestamp: new Date().toISOString(),
      };

      eventListener(chunkPayload);

      expect(mockResponse.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(chunkPayload)}\n\n`
      );
    });

    it('should extract sessionId from TOOL event payload', () => {
      const sessionId = 'test-session-456';
      const ticker = 'MSFT';

      service.registerStream(sessionId, mockResponse as Response);

      const toolPayload = {
        type: StreamEventType.TOOL,
        sessionId,
        ticker,
        toolName: 'fetch_company_data',
        toolId: 'tool_123',
        toolInput: { ticker: 'MSFT' },
        timestamp: new Date().toISOString(),
      };

      eventListener(toolPayload);

      expect(mockResponse.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(toolPayload)}\n\n`
      );
    });

    it('should extract sessionId from THINKING event payload', () => {
      const sessionId = 'test-session-789';
      const ticker = 'GOOGL';

      service.registerStream(sessionId, mockResponse as Response);

      const thinkingPayload = {
        type: StreamEventType.THINKING,
        sessionId,
        ticker,
        message: 'Analyzing data...',
        timestamp: new Date().toISOString(),
      };

      eventListener(thinkingPayload);

      expect(mockResponse.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(thinkingPayload)}\n\n`
      );
    });

    it('should extract sessionId from ERROR event payload', () => {
      const sessionId = 'test-session-error';
      const ticker = 'TSLA';

      service.registerStream(sessionId, mockResponse as Response);

      const errorPayload = {
        type: StreamEventType.ERROR,
        sessionId,
        message: 'Test error',
        timestamp: new Date().toISOString(),
      };

      eventListener(errorPayload);

      expect(mockResponse.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(errorPayload)}\n\n`
      );
    });

    it('should extract sessionId from COMPLETE event payload', () => {
      const sessionId = 'test-session-complete';
      const ticker = 'AMZN';

      service.registerStream(sessionId, mockResponse as Response);

      const completePayload = {
        type: StreamEventType.COMPLETE,
        sessionId,
        ticker,
        timestamp: new Date().toISOString(),
        metadata: {
          analysisDate: new Date().toISOString(),
          workflowType: 'analysis',
          model: 'claude-sonnet-4',
          duration: 5000,
        },
      };

      eventListener(completePayload);

      expect(mockResponse.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(completePayload)}\n\n`
      );
    });

    it('should not forward event if sessionId is missing from payload', () => {
      const sessionId = 'test-session-123';
      const ticker = 'AAPL';

      service.registerStream(sessionId, mockResponse as Response);

      // Payload without sessionId
      const invalidPayload = {
        type: StreamEventType.CHUNK,
        ticker,
        content: 'Test content',
        phase: 'analysis',
        timestamp: new Date().toISOString(),
      };

      eventListener(invalidPayload);

      // Should not forward event
      expect(mockResponse.write).not.toHaveBeenCalled();
    });

    it('should not forward event if no active stream for sessionId', () => {
      const sessionId = 'test-session-123';
      const ticker = 'AAPL';

      // Don't create stream, just send event
      const chunkPayload = {
        type: StreamEventType.CHUNK,
        sessionId,
        ticker,
        content: 'Test content',
        phase: 'analysis',
        timestamp: new Date().toISOString(),
      };

      eventListener(chunkPayload);

      // Should not throw, should not forward
      expect(mockResponse.write).not.toHaveBeenCalled();
    });

    it('should handle multiple concurrent streams', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      const ticker1 = 'AAPL';
      const ticker2 = 'MSFT';

      const mockResponse1: Partial<Response> = {
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        on: jest.fn(),
      };

      const mockResponse2: Partial<Response> = {
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        on: jest.fn(),
      };

      service.registerStream(session1, mockResponse1 as Response);
      service.registerStream(session2, mockResponse2 as Response);

      // Send event to session1
      const payload1 = {
        type: StreamEventType.CHUNK,
        sessionId: session1,
        ticker: ticker1,
        content: 'Content for session 1',
        phase: 'analysis',
        timestamp: new Date().toISOString(),
      };

      eventListener(payload1);

      // Only session1 should receive the event
      expect(mockResponse1.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify(payload1)}\n\n`
      );
      expect(mockResponse2.write).not.toHaveBeenCalled();
    });
  });
});
