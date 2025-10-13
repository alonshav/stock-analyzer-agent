/**
 * Mock utilities for testing Telegram bot
 */

export interface MockTelegramContext {
  message?: {
    message_id: number;
    text?: string;
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
  };
  callbackQuery?: {
    id: string;
    data?: string;
    from: {
      id: number;
      username?: string;
    };
  };
  chat?: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
  };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
  };
  reply: jest.Mock;
  replyWithMarkdown: jest.Mock;
  sendChatAction: jest.Mock;
  answerCbQuery: jest.Mock;
  editMessageText: jest.Mock;
  editMessageReplyMarkup: jest.Mock;
  telegram: {
    editMessageText: jest.Mock;
    sendDocument: jest.Mock;
  };
}

export class MockTelegramHelper {
  private static sentMessages: string[] = [];
  private static sentDocuments: Buffer[] = [];

  /**
   * Create mock context for text message
   */
  static createContext(
    chatId: string,
    messageText: string,
    userId = 12345
  ): MockTelegramContext {
    MockTelegramHelper.sentMessages = [];
    MockTelegramHelper.sentDocuments = [];

    const ctx: MockTelegramContext = {
      message: {
        message_id: Date.now(),
        text: messageText,
        from: {
          id: userId,
          username: 'testuser',
          first_name: 'Test',
        },
      },
      chat: {
        id: parseInt(chatId),
        type: 'private',
      },
      from: {
        id: userId,
        username: 'testuser',
        first_name: 'Test',
      },
      reply: jest.fn().mockImplementation((text: string) => {
        MockTelegramHelper.sentMessages.push(text);
        return Promise.resolve({ message_id: Date.now() });
      }),
      replyWithMarkdown: jest.fn().mockImplementation((text: string) => {
        MockTelegramHelper.sentMessages.push(text);
        return Promise.resolve({ message_id: Date.now() });
      }),
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      telegram: {
        editMessageText: jest.fn().mockResolvedValue(undefined),
        sendDocument: jest.fn().mockImplementation((chatId, doc, _options) => {
          if (doc.source) {
            MockTelegramHelper.sentDocuments.push(doc.source);
          }
          return Promise.resolve({ message_id: Date.now() });
        }),
      },
    };

    return ctx;
  }

  /**
   * Create mock context for callback query
   */
  static createCallbackQuery(
    chatId: string,
    data: string,
    userId = 12345
  ): MockTelegramContext {
    MockTelegramHelper.sentMessages = [];

    const ctx: MockTelegramContext = {
      callbackQuery: {
        id: `cbq_${Date.now()}`,
        data,
        from: {
          id: userId,
          username: 'testuser',
        },
      },
      chat: {
        id: parseInt(chatId),
        type: 'private',
      },
      from: {
        id: userId,
        username: 'testuser',
      },
      reply: jest.fn().mockImplementation((text: string) => {
        MockTelegramHelper.sentMessages.push(text);
        return Promise.resolve({ message_id: Date.now() });
      }),
      replyWithMarkdown: jest.fn().mockResolvedValue({ message_id: Date.now() }),
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
      editMessageReplyMarkup: jest.fn().mockResolvedValue(undefined),
      telegram: {
        editMessageText: jest.fn().mockResolvedValue(undefined),
        sendDocument: jest.fn().mockResolvedValue({ message_id: Date.now() }),
      },
    };

    return ctx;
  }

  /**
   * Capture all replies sent via context
   */
  static captureReplies(): string[] {
    return [...MockTelegramHelper.sentMessages];
  }

  /**
   * Capture all documents sent via context
   */
  static captureSentDocuments(): Buffer[] {
    return [...MockTelegramHelper.sentDocuments];
  }

  /**
   * Reset captured data
   */
  static reset(): void {
    MockTelegramHelper.sentMessages = [];
    MockTelegramHelper.sentDocuments = [];
  }

  /**
   * Create mock context with specific message ID
   */
  static createContextWithMessageId(
    chatId: string,
    messageText: string,
    messageId: number
  ): MockTelegramContext {
    const ctx = MockTelegramHelper.createContext(chatId, messageText);
    if (ctx.message) {
      ctx.message.message_id = messageId;
    }
    return ctx;
  }
}
