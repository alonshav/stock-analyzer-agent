import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';

/**
 * TelegramFormatterService - Telegram-Specific Message Formatting
 *
 * SINGLE RESPONSIBILITY: Format and send messages to Telegram
 *
 * Handles:
 * - Markdown escaping for MarkdownV2
 * - Message splitting (4000 char limit)
 * - Safe message sending with fallbacks
 */
@Injectable()
export class TelegramFormatterService {
  private readonly logger = new Logger(TelegramFormatterService.name);
  private readonly MAX_LENGTH = 4000;

  /**
   * Send long messages by splitting them if they exceed Telegram's 4096 character limit
   */
  async sendLongMessage(ctx: Context, content: string, useMarkdown = true): Promise<void> {
    this.logger.debug(`sendLongMessage called - content length: ${content.length}, useMarkdown: ${useMarkdown}`);

    try {
      if (useMarkdown) {
        const escaped = this.escapeMarkdownV2(content);

        if (escaped.length <= this.MAX_LENGTH) {
          await ctx.replyWithMarkdownV2(escaped);
          return;
        }

        const chunks = this.splitIntoChunks(escaped, this.MAX_LENGTH);
        for (const chunk of chunks) {
          await ctx.replyWithMarkdownV2(chunk);
        }
      } else {
        if (content.length <= this.MAX_LENGTH) {
          await ctx.reply(content);
          return;
        }

        const chunks = this.splitIntoChunks(content, this.MAX_LENGTH);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      }
    } catch (error) {
      this.logger.error('Failed to send message with MarkdownV2, falling back to plain text:', error);
      // Final fallback: send as plain text
      if (content.length <= this.MAX_LENGTH) {
        await ctx.reply(content);
      } else {
        const chunks = this.splitIntoChunks(content, this.MAX_LENGTH);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      }
    }
  }

  /**
   * Split text into chunks at newline boundaries
   */
  private splitIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        // If single line is too long, split it forcefully
        if (line.length > maxLength) {
          let remaining = line;
          while (remaining.length > maxLength) {
            chunks.push(remaining.substring(0, maxLength));
            remaining = remaining.substring(maxLength);
          }
          currentChunk = remaining;
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Convert Claude's Markdown to Telegram MarkdownV2
   */
  private escapeMarkdownV2(text: string): string {
    // Step 1: Preserve links
    const links: Array<{ text: string; url: string }> = [];
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, url) => {
      links.push({ text: linkText, url });
      return `XLINK${links.length - 1}X`;
    });

    // Step 2: Convert headings to bold
    const lines = text.split('\n');
    const processedLines = lines.map((line) => {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const content = headingMatch[2];
        const stripped = content
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/_([^_]+)_/g, '$1');
        return `XBOLDX${stripped}XBOLDENDX`;
      }
      return line;
    });
    text = processedLines.join('\n');

    // Step 3: Handle **bold** - strip paragraph-bold (>150 chars), keep short bold
    const PARAGRAPH_THRESHOLD = 150;
    text = text.replace(/\*\*([^*]+?)\*\*/g, (match, content) => {
      if (content.length > PARAGRAPH_THRESHOLD) {
        return content;
      } else {
        return `XBOLDX${content}XBOLDENDX`;
      }
    });

    // Step 4: Convert *italic* to placeholder
    text = text.replace(/\*([^*]+?)\*/g, (match, content) => {
      return `XITALICX${content}XITALICENDX`;
    });

    // Step 5: Escape all special MarkdownV2 characters
    text = text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');

    // Step 6: Convert placeholders back to MarkdownV2 syntax
    text = text.replace(/XBOLDX/g, '*');
    text = text.replace(/XBOLDENDX/g, '*');
    text = text.replace(/XITALICX/g, '_');
    text = text.replace(/XITALICENDX/g, '_');

    // Step 7: Restore links
    links.forEach((link, index) => {
      const linkMarkdown = `[${link.text}](${link.url})`;
      text = text.replace(`XLINK${index}X`, linkMarkdown);
    });

    return text;
  }
}
