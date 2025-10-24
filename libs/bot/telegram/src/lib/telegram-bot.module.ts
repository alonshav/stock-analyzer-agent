import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { StreamManagerService } from './stream-manager.service';
import { BotMessagingService } from './bot-messaging.service';
import { SessionStoreModule } from '@stock-analyzer/bot/sessions';
import { TelegramFormatterService, ToolEventFormatterService } from './formatters';

@Module({
  imports: [ConfigModule, SessionStoreModule],
  controllers: [TelegramBotController],
  providers: [
    TelegramBotService,
    StreamManagerService,
    BotMessagingService,
    TelegramFormatterService,
    ToolEventFormatterService,
  ],
  exports: [TelegramBotService, BotMessagingService],
})
export class TelegramBotModule {}
