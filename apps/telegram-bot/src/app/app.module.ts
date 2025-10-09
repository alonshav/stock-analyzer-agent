import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramBotModule } from '@stock-analyzer/bot/telegram';
import telegramConfig from '../environment';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [telegramConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    TelegramBotModule,
  ],
})
export class AppModule {}
