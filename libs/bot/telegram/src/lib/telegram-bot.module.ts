import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { StreamManagerService } from './stream-manager.service';

@Module({
  imports: [ConfigModule],
  controllers: [TelegramBotController],
  providers: [
    TelegramBotService,
    StreamManagerService,
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
