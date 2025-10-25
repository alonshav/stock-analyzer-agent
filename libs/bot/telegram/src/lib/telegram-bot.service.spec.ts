/**
 * TelegramBotService Tests
 * Tests for persistent chat sessions and simplified bot handlers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';
import { StreamManagerService } from './stream-manager.service';
import { BotMessagingService } from './bot-messaging.service';
import { SessionOrchestrator } from '@stock-analyzer/bot/sessions';
import {
  ChatSession,
  SessionStatus,
  MessageRole,
} from '@stock-analyzer/bot/sessions';
import { WorkflowType } from '@stock-analyzer/shared/types';
import { Context } from 'telegraf';

// Mock Telegraf
const mockBot = {
  command: jest.fn(),
  on: jest.fn(),
  catch: jest.fn(),
  launch: jest.fn().mockResolvedValue(undefined),
  telegram: {
    setWebhook: jest.fn(),
    sendDocument: jest.fn(),
  },
};

jest.mock('telegraf', () => ({
  Telegraf: jest.fn(() => mockBot),
}));

describe('TelegramBotService', () => {
  let service: TelegramBotService;
  let streamManager: jest.Mocked<StreamManagerService>;
  let sessionOrchestrator: jest.Mocked<SessionOrchestrator>;
  let botMessaging: jest.Mocked<BotMessagingService>;

  const mockSession: ChatSession = {
    sessionId: 'chat123-1234567890',
    chatId: '123',
    status: SessionStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    conversationHistory: [],
    workflows: [],
    metadata: {},
  };

  const createMockContext = (text: string, chatId = '123'): Partial<Context> => ({
    chat: { id: parseInt(chatId), type: 'private' } as any,
    message: { text } as any,
    reply: jest.fn().mockResolvedValue(undefined),
    sendChatAction: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'telegram.botToken') return 'test-bot-token';
              if (key === 'telegram.agentUrl') return 'http://localhost:3001';
              if (key === 'telegram.webhookEnabled') return false;
              return undefined;
            }),
          },
        },
        {
          provide: StreamManagerService,
          useValue: {
            executeWorkflow: jest.fn().mockResolvedValue(undefined),
            executeConversation: jest.fn().mockResolvedValue(undefined),
            isResponding: jest.fn().mockReturnValue(false),
            stopStream: jest.fn(),
            stopResponding: jest.fn(),
          },
        },
        {
          provide: SessionOrchestrator,
          useValue: {
            getSession: jest.fn(),
            getOrCreateSession: jest.fn(),
            stopSession: jest.fn(),
            trackWorkflow: jest.fn(),
            addMessage: jest.fn(),
          },
        },
        {
          provide: BotMessagingService,
          useValue: {
            sendAndTrack: jest.fn().mockResolvedValue(undefined),
            trackUserMessage: jest.fn(),
            trackAssistantMessage: jest.fn(),
            sendDocumentAndTrack: jest.fn().mockResolvedValue(undefined),
            sendTypingAction: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramBotService>(TelegramBotService);
    streamManager = module.get(
      StreamManagerService
    ) as jest.Mocked<StreamManagerService>;
    sessionOrchestrator = module.get(
      SessionOrchestrator
    ) as jest.Mocked<SessionOrchestrator>;
    botMessaging = module.get(
      BotMessagingService
    ) as jest.Mocked<BotMessagingService>;

    // Initialize bot to register command handlers
    await service.onApplicationBootstrap();
  });

  describe('onApplicationBootstrap', () => {
    it('should setup bot and launch in polling mode', async () => {
      await service.onApplicationBootstrap();

      expect(mockBot.command).toHaveBeenCalledWith('start', expect.any(Function));
      expect(mockBot.command).toHaveBeenCalledWith('analyze', expect.any(Function));
      expect(mockBot.command).toHaveBeenCalledWith('stop', expect.any(Function));
      expect(mockBot.command).toHaveBeenCalledWith('status', expect.any(Function));
      expect(mockBot.command).toHaveBeenCalledWith('help', expect.any(Function));
      expect(mockBot.command).toHaveBeenCalledWith('new', expect.any(Function));
      expect(mockBot.command).toHaveBeenCalledWith('reset', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('text', expect.any(Function));
      expect(mockBot.launch).toHaveBeenCalled();
    });
  });

  describe('/new command', () => {
    it('should stop current session and create new one', async () => {
      const ctx = createMockContext('/new') as Context;
      const chatId = '123';

      sessionOrchestrator.getSession.mockReturnValue(mockSession);
      sessionOrchestrator.getOrCreateSession.mockReturnValue({
        ...mockSession,
        sessionId: 'chat123-9999999999',
        conversationHistory: [],
        workflows: [],
      });

      // Get the /new command handler
      const newCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'new'
      );
      const newCommandHandler = newCommandCall![1];

      await newCommandHandler(ctx);

      expect(sessionOrchestrator.stopSession).toHaveBeenCalledWith(
        chatId,
        'User started new session'
      );
      expect(sessionOrchestrator.getOrCreateSession).toHaveBeenCalledWith(chatId);
      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        chatId,
        expect.stringContaining('New Session Started')
      );
    });

    it('should handle /new when no existing session', async () => {
      const ctx = createMockContext('/new') as Context;
      const chatId = '123';

      sessionOrchestrator.getSession.mockReturnValue(null);
      sessionOrchestrator.getOrCreateSession.mockReturnValue(mockSession);

      const newCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'new'
      );
      const newCommandHandler = newCommandCall![1];

      await newCommandHandler(ctx);

      expect(sessionOrchestrator.stopSession).not.toHaveBeenCalled();
      expect(sessionOrchestrator.getOrCreateSession).toHaveBeenCalled();
    });

    it('/reset should be alias for /new', async () => {
      const ctx = createMockContext('/reset') as Context;

      sessionOrchestrator.getSession.mockReturnValue(null);
      sessionOrchestrator.getOrCreateSession.mockReturnValue(mockSession);

      const resetCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'reset'
      );
      const resetCommandHandler = resetCommandCall![1];

      await resetCommandHandler(ctx);

      expect(sessionOrchestrator.getOrCreateSession).toHaveBeenCalled();
    });
  });

  describe('Text message handler', () => {
    it('should route text to conversation mode', async () => {
      const ctx = createMockContext('What is the P/E ratio?') as Context;
      const chatId = '123';

      const textHandlerCall = mockBot.on.mock.calls.find(
        (call) => call[0] === 'text'
      );
      const textHandler = textHandlerCall![1];

      await textHandler(ctx);

      expect(streamManager.executeConversation).toHaveBeenCalledWith(
        chatId,
        'What is the P/E ratio?',
        ctx,
        'http://localhost:3001'
      );
      expect(ctx.sendChatAction).toHaveBeenCalledWith('typing');
    });

    it('should block input when bot is responding', async () => {
      const ctx = createMockContext('Test message') as Context;

      streamManager.isResponding.mockReturnValue(true);

      const textHandlerCall = mockBot.on.mock.calls.find(
        (call) => call[0] === 'text'
      );
      const textHandler = textHandlerCall![1];

      await textHandler(ctx);

      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        '123',
        expect.stringContaining('Please wait')
      );
      expect(streamManager.executeConversation).not.toHaveBeenCalled();
    });

    it('should handle conversation errors gracefully', async () => {
      const ctx = createMockContext('Test') as Context;

      streamManager.executeConversation.mockRejectedValue(
        new Error('Stream error')
      );

      const textHandlerCall = mockBot.on.mock.calls.find(
        (call) => call[0] === 'text'
      );
      const textHandler = textHandlerCall![1];

      await textHandler(ctx);

      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        '123',
        expect.stringContaining('Failed to start conversation')
      );
    });
  });

  describe('/analyze command', () => {
    it('should execute workflow via StreamManager', async () => {
      const ctx = createMockContext('/analyze AAPL') as Context;
      const chatId = '123';

      const analyzeCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'analyze'
      );
      const analyzeHandler = analyzeCommandCall![1];

      await analyzeHandler(ctx);

      expect(streamManager.executeWorkflow).toHaveBeenCalledWith(
        chatId,
        WorkflowType.FULL_ANALYSIS,
        'AAPL',
        ctx,
        'http://localhost:3001'
      );
      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        chatId,
        expect.stringContaining('Starting analysis for AAPL')
      );
    });

    it('should show usage when ticker not provided', async () => {
      const ctx = createMockContext('/analyze') as Context;

      const analyzeCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'analyze'
      );
      const analyzeHandler = analyzeCommandCall![1];

      await analyzeHandler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /analyze TICKER')
      );
      expect(streamManager.executeWorkflow).not.toHaveBeenCalled();
    });

    it('should block analysis when bot is responding', async () => {
      const ctx = createMockContext('/analyze MSFT') as Context;

      streamManager.isResponding.mockReturnValue(true);

      const analyzeCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'analyze'
      );
      const analyzeHandler = analyzeCommandCall![1];

      await analyzeHandler(ctx);

      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        '123',
        expect.stringContaining('Please wait')
      );
      expect(streamManager.executeWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('/status command', () => {
    it('should show session status with workflow history', async () => {
      const ctx = createMockContext('/status') as Context;
      const sessionWithWorkflows: ChatSession = {
        ...mockSession,
        workflows: [
          {
            workflowId: 'wf-1',
            workflowType: 'full_analysis',
            ticker: 'AAPL',
            startedAt: new Date(),
            completedAt: new Date(),
            result: 'Analysis complete',
          },
          {
            workflowId: 'wf-2',
            workflowType: 'full_analysis',
            ticker: 'MSFT',
            startedAt: new Date(),
          },
        ],
        conversationHistory: [
          {
            role: MessageRole.USER,
            content: 'Test message',
            timestamp: new Date(),
          },
        ],
      };

      sessionOrchestrator.getSession.mockReturnValue(sessionWithWorkflows);

      const statusCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'status'
      );
      const statusHandler = statusCommandCall![1];

      await statusHandler(ctx);

      const sendAndTrackCall = (botMessaging.sendAndTrack as jest.Mock).mock.calls[0][2];
      expect(sendAndTrackCall).toContain('Session Status');
      expect(sendAndTrackCall).toContain('Messages: 1');
      expect(sendAndTrackCall).toContain('Workflows: 2');
      expect(sendAndTrackCall).toContain('full_analysis (AAPL) ✓');
      expect(sendAndTrackCall).toContain('full_analysis (MSFT) (in progress)');
    });

    it('should show message when no active session', async () => {
      const ctx = createMockContext('/status') as Context;

      sessionOrchestrator.getSession.mockReturnValue(null);

      const statusCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'status'
      );
      const statusHandler = statusCommandCall![1];

      await statusHandler(ctx);

      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        '123',
        expect.stringContaining('No active session')
      );
    });
  });

  describe('/stop command', () => {
    it('should stop stream and session when responding', async () => {
      const ctx = createMockContext('/stop') as Context;
      const chatId = '123';

      streamManager.isResponding.mockReturnValue(true);

      const stopCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'stop'
      );
      const stopHandler = stopCommandCall![1];

      await stopHandler(ctx);

      expect(streamManager.stopStream).toHaveBeenCalledWith(chatId);
      expect(streamManager.stopResponding).toHaveBeenCalledWith(chatId);
      expect(sessionOrchestrator.stopSession).toHaveBeenCalledWith(
        chatId,
        'User stopped response'
      );
      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        chatId,
        '❌ Stopped.'
      );
    });

    it('should show message when nothing to stop', async () => {
      const ctx = createMockContext('/stop') as Context;

      streamManager.isResponding.mockReturnValue(false);

      const stopCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'stop'
      );
      const stopHandler = stopCommandCall![1];

      await stopHandler(ctx);

      expect(botMessaging.sendAndTrack).toHaveBeenCalledWith(
        ctx,
        '123',
        expect.stringContaining('Nothing to stop')
      );
      expect(streamManager.stopStream).not.toHaveBeenCalled();
    });
  });

  describe('Bot simplification', () => {
    it('should delegate workflow execution to StreamManager', async () => {
      const ctx = createMockContext('/analyze TSLA') as Context;

      const analyzeCommandCall = mockBot.command.mock.calls.find(
        (call) => call[0] === 'analyze'
      );
      const analyzeHandler = analyzeCommandCall![1];

      await analyzeHandler(ctx);

      // Bot only does validation and single method call
      expect(streamManager.executeWorkflow).toHaveBeenCalledTimes(1);
      // StreamManager handles session, tracking, and execution
    });

    it('should delegate conversation execution to StreamManager', async () => {
      const ctx = createMockContext('Random question') as Context;

      const textHandlerCall = mockBot.on.mock.calls.find(
        (call) => call[0] === 'text'
      );
      const textHandler = textHandlerCall![1];

      await textHandler(ctx);

      // Bot only does validation and single method call
      expect(streamManager.executeConversation).toHaveBeenCalledTimes(1);
      // StreamManager handles session, history, and execution
    });
  });
});
