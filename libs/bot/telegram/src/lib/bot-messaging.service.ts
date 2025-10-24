import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { SessionOrchestrator, MessageRole } from '@stock-analyzer/bot/sessions';

/**
 * BotMessagingService - Centralized Message Handling
 *
 * LOW-LEVEL SERVICE: All bot messages MUST go through this service.
 * This ensures EVERY message is automatically:
 * 1. Sent to Telegram
 * 2. Added to conversation history
 *
 * This eliminates the need to manually call addMessage() everywhere
 * and ensures complete conversation context is maintained.
 */
@Injectable()
export class BotMessagingService {
  private readonly logger = new Logger(BotMessagingService.name);

  constructor(private readonly sessionOrchestrator: SessionOrchestrator) {}

  /**
   * Send user message and track in conversation history
   *
   * Use this when the bot receives a message from the user
   */
  async trackUserMessage(chatId: string, message: string): Promise<void> {
    this.sessionOrchestrator.addMessage(chatId, MessageRole.USER, message);
    this.logger.debug(`[${chatId}] Tracked user message: ${message.substring(0, 50)}...`);
  }

  /**
   * Send assistant message to Telegram AND track in conversation history
   *
   * This is the LOW-LEVEL method that ALL bot responses should use.
   * It ensures every message sent to Telegram is also saved to conversation history.
   */
  async sendAndTrack(
    ctx: Context,
    chatId: string,
    message: string,
    options?: { parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2' }
  ): Promise<void> {
    try {
      // 1. Send to Telegram
      await ctx.reply(message, options);

      // 2. Add to conversation history
      this.sessionOrchestrator.addMessage(
        chatId,
        MessageRole.ASSISTANT,
        message
      );

      this.logger.debug(
        `[${chatId}] Sent and tracked message: ${message.substring(0, 50)}...`
      );
    } catch (error) {
      this.logger.error(`[${chatId}] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Send assistant message to Telegram AND track in conversation history
   * Alternative signature for backward compatibility
   */
  async replyAndTrack(
    ctx: Context,
    chatId: string,
    message: string
  ): Promise<void> {
    return this.sendAndTrack(ctx, chatId, message);
  }

  /**
   * Send typing action (does NOT track in conversation history)
   */
  async sendTypingAction(ctx: Context): Promise<void> {
    try {
      await ctx.sendChatAction('typing');
    } catch (error) {
      this.logger.error('Failed to send typing action:', error);
    }
  }

  /**
   * Track assistant message in conversation history without sending to Telegram
   *
   * Use this for messages that are sent through other means (e.g., documents, photos)
   * or when the message was already sent but needs to be tracked
   */
  trackAssistantMessage(chatId: string, message: string): void {
    this.sessionOrchestrator.addMessage(
      chatId,
      MessageRole.ASSISTANT,
      message
    );
    this.logger.debug(
      `[${chatId}] Tracked assistant message: ${message.substring(0, 50)}...`
    );
  }

  /**
   * Send document and track notification in conversation history
   */
  async sendDocumentAndTrack(
    ctx: Context,
    chatId: string,
    buffer: Buffer,
    filename: string,
    caption: string
  ): Promise<void> {
    try {
      const chatIdNum = ctx.chat?.id;
      if (!chatIdNum) {
        throw new Error('Chat ID not available');
      }

      // Send document to Telegram
      await ctx.telegram.sendDocument(
        chatIdNum,
        {
          source: buffer,
          filename: filename,
        },
        {
          caption,
        }
      );

      // Track in conversation history
      this.trackAssistantMessage(chatId, caption);

      this.logger.log(`[${chatId}] Sent and tracked document: ${filename}`);
    } catch (error) {
      this.logger.error(`[${chatId}] Failed to send document:`, error);
      throw error;
    }
  }

  /**
   * Send long message (split if needed) and track in conversation history
   *
   * Use this for streaming or long-form content
   */
  async sendLongMessageAndTrack(
    ctx: Context,
    chatId: string,
    content: string,
    isStreaming: boolean = false
  ): Promise<void> {
    // For now, just send as regular message
    // In the future, this could integrate with TelegramFormatterService
    // to handle message splitting and editing
    await this.sendAndTrack(ctx, chatId, content);
  }
}
