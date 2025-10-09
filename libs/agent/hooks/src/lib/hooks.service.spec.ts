/**
 * HooksService Tests (TDD - Tests First)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HooksService } from './hooks.service';
import { SessionManagerService } from '@stock-analyzer/agent/session';

describe('HooksService', () => {
  let service: HooksService;
  let eventEmitter: EventEmitter2;
  let sessionManager: SessionManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HooksService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: SessionManagerService,
          useValue: {
            createSession: jest.fn(),
            getActiveSession: jest.fn(),
            addMetric: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HooksService>(HooksService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    sessionManager = module.get<SessionManagerService>(SessionManagerService);
  });

  describe('createOnMessageHook', () => {
    it('should log message types', () => {
      const logSpy = jest.spyOn(service['logger'], 'debug');
      const hook = service.createOnMessageHook('session1', 'chat1');

      hook({ type: 'assistant', message: { content: [] } });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('assistant'));
    });

    it('should track token usage', () => {
      const mockSession = { ticker: 'AAPL' };
      jest.spyOn(sessionManager, 'getActiveSession').mockReturnValue(mockSession as any);

      const hook = service.createOnMessageHook('session1', 'chat1');

      hook({
        type: 'assistant',
        message: { content: [] },
        usage: { input_tokens: 1000, output_tokens: 500 },
      });

      expect(sessionManager.addMetric).toHaveBeenCalledWith('chat1', 'tokens', 1500);
    });

    it('should emit progress events', () => {
      const hook = service.createOnMessageHook('session1', 'chat1');

      hook({ type: 'assistant', message: { content: [] } });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'stream.progress.session1',
        expect.objectContaining({ messageType: 'assistant' })
      );
    });

    it('should not track tokens when no session exists', () => {
      jest.spyOn(sessionManager, 'getActiveSession').mockReturnValue(null);

      const hook = service.createOnMessageHook('session1', 'chat1');

      hook({
        type: 'assistant',
        usage: { input_tokens: 1000, output_tokens: 500 },
      });

      expect(sessionManager.addMetric).not.toHaveBeenCalled();
    });
  });

  describe('createOnToolUseHook', () => {
    it('should validate tool inputs', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'fetch_company_data', input: {} });
      }).toThrow('Missing required parameter: ticker');
    });

    it('should allow valid tool inputs', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'fetch_company_data', input: { ticker: 'AAPL' } });
      }).not.toThrow();
    });

    it('should inject session context into tool input', () => {
      const mockSession = { ticker: 'AAPL', sessionId: 'AAPL-123' };
      jest.spyOn(sessionManager, 'getActiveSession').mockReturnValue(mockSession as any);

      const hook = service.createOnToolUseHook('session1', 'chat1');

      const result = hook({
        name: 'fetch_company_data',
        input: { ticker: 'AAPL' },
      });

      expect(result?.input).toMatchObject({
        ticker: 'AAPL',
        sessionId: 'session1',
        tickerContext: 'AAPL',
      });
    });

    it('should enforce budget limits', () => {
      service.setBudget('session1', {
        limit: 1.0,
        used: 0.9,
        toolCosts: { fetch_company_data: 0.2 } // Specify cost that will exceed limit
      });

      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({
          name: 'fetch_company_data',
          input: { ticker: 'AAPL' },
        });
      }).toThrow('Budget exceeded');
    });

    it('should track budget usage', () => {
      service.setBudget('session1', {
        limit: 5.0,
        used: 0,
        toolCosts: { fetch_company_data: 0.1 },
      });

      const hook = service.createOnToolUseHook('session1', 'chat1');

      hook({
        name: 'fetch_company_data',
        input: { ticker: 'AAPL' },
      });

      const budget = service.getBudget('session1');
      expect(budget?.used).toBe(0.1);
    });

    it('should allow tools when no budget is set', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({
          name: 'fetch_company_data',
          input: { ticker: 'AAPL' },
        });
      }).not.toThrow();
    });

    it('should increment tool call metric', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      hook({
        name: 'fetch_company_data',
        input: { ticker: 'AAPL' },
      });

      expect(sessionManager.addMetric).toHaveBeenCalledWith('chat1', 'toolCalls', 1);
    });
  });

  describe('createOnToolResultHook', () => {
    it('should enhance error messages with context', () => {
      const mockSession = { ticker: 'AAPL', startedAt: new Date(), conversationHistory: [] };
      jest.spyOn(sessionManager, 'getActiveSession').mockReturnValue(mockSession as any);

      const hook = service.createOnToolResultHook('session1', 'chat1');

      const result = hook({
        tool_use_id: 'tool1',
        content: 'API rate limit exceeded',
        is_error: true,
      });

      expect(result?.content).toContain('Error occurred while analyzing AAPL');
      expect(result?.content).toContain('API rate limit exceeded');
    });

    it('should not modify non-error results', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      const result = hook({
        tool_use_id: 'tool1',
        content: 'Success data',
        is_error: false,
      });

      expect(result?.content).toBe('Success data');
    });

    it('should filter sensitive data from results', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      const result = hook({
        tool_use_id: 'tool1',
        content: JSON.stringify({ apiKey: 'secret', data: 'public' }),
        is_error: false,
      });

      const parsed = JSON.parse(result?.content || '{}');
      expect(parsed.apiKey).toBeUndefined();
      expect(parsed.data).toBe('public');
    });

    it('should cache tool results', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      hook({
        tool_use_id: 'tool1',
        content: 'result data',
        is_error: false,
      });

      const cached = service.getCachedResult('tool1');
      expect(cached).toBe('result data');
    });

    it('should handle non-JSON content gracefully', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      const result = hook({
        tool_use_id: 'tool1',
        content: 'plain text result',
        is_error: false,
      });

      expect(result?.content).toBe('plain text result');
    });

    it('should increment error metric on error results', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      hook({
        tool_use_id: 'tool1',
        content: 'Error message',
        is_error: true,
      });

      expect(sessionManager.addMetric).toHaveBeenCalledWith('chat1', 'errors', 1);
    });
  });

  describe('Budget Management', () => {
    it('should set budget for session', () => {
      const budget = { limit: 10.0, used: 0, toolCosts: {} };
      service.setBudget('session1', budget);

      expect(service.getBudget('session1')).toEqual(budget);
    });

    it('should return undefined for non-existent budget', () => {
      expect(service.getBudget('session999')).toBeUndefined();
    });

    it('should update budget used amount', () => {
      service.setBudget('session1', {
        limit: 10.0,
        used: 1.0,
        toolCosts: { fetch_company_data: 0.5 },
      });

      const hook = service.createOnToolUseHook('session1', 'chat1');
      hook({ name: 'fetch_company_data', input: { ticker: 'AAPL' } });

      const budget = service.getBudget('session1');
      expect(budget?.used).toBe(1.5);
    });

    it('should use default cost when tool cost not specified', () => {
      service.setBudget('session1', {
        limit: 10.0,
        used: 0,
        toolCosts: {},
      });

      const hook = service.createOnToolUseHook('session1', 'chat1');
      hook({ name: 'unknown_tool', input: {} });

      const budget = service.getBudget('session1');
      expect(budget?.used).toBe(0.01); // Default cost
    });
  });

  describe('Tool Result Caching', () => {
    it('should cache tool results by tool ID', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      hook({ tool_use_id: 'tool1', content: 'result1' });
      hook({ tool_use_id: 'tool2', content: 'result2' });

      expect(service.getCachedResult('tool1')).toBe('result1');
      expect(service.getCachedResult('tool2')).toBe('result2');
    });

    it('should return undefined for non-cached tool', () => {
      expect(service.getCachedResult('tool999')).toBeUndefined();
    });

    it('should overwrite cached result on duplicate tool ID', () => {
      const hook = service.createOnToolResultHook('session1', 'chat1');

      hook({ tool_use_id: 'tool1', content: 'result1' });
      hook({ tool_use_id: 'tool1', content: 'result2' });

      expect(service.getCachedResult('tool1')).toBe('result2');
    });
  });

  describe('Hook Composition', () => {
    it('should chain multiple onToolUse hooks', () => {
      const hook1 = (tool: any) => ({ ...tool, input: { ...tool.input, hook1: true } });
      const hook2 = (tool: any) => ({ ...tool, input: { ...tool.input, hook2: true } });

      const composed = service.composeToolUseHooks([hook1, hook2]);
      const result = composed({ name: 'test', input: {} });

      expect(result?.input).toMatchObject({ hook1: true, hook2: true });
    });

    it('should handle empty hook array', () => {
      const composed = service.composeToolUseHooks([]);
      const result = composed({ name: 'test', input: { foo: 'bar' } });

      expect(result).toEqual({ name: 'test', input: { foo: 'bar' } });
    });

    it('should handle hooks that return void', () => {
      const hook1 = (tool: any) => ({ ...tool, input: { ...tool.input, modified: true } });
      const hook2 = () => undefined; // Returns void

      const composed = service.composeToolUseHooks([hook1, hook2]);
      const result = composed({ name: 'test', input: {} });

      expect(result?.input).toMatchObject({ modified: true });
    });
  });

  describe('Tool Input Validation', () => {
    it('should validate fetch_company_data requires ticker', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'fetch_company_data', input: { dataTypes: ['profile'] } });
      }).toThrow('Missing required parameter: ticker');
    });

    it('should validate calculate_dcf requires ticker', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'calculate_dcf', input: { projectionYears: 5 } });
      }).toThrow('Missing required parameter: ticker');
    });

    it('should allow tools with all required parameters', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'calculate_dcf', input: { ticker: 'AAPL', projectionYears: 5 } });
      }).not.toThrow();
    });

    it('should not validate unknown tools', () => {
      const hook = service.createOnToolUseHook('session1', 'chat1');

      expect(() => {
        hook({ name: 'unknown_tool', input: {} });
      }).not.toThrow();
    });
  });
});
