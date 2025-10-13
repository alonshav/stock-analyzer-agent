import { Controller, Post, Body, Get, HttpCode } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';

@Controller('telegram')
export class TelegramBotController {
  constructor(private readonly botService: TelegramBotService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() update: Record<string, unknown>) {
    await this.botService.handleUpdate(update);
    return { ok: true };
  }

  @Get('health')
  health() {
    return {
      status: 'healthy',
      service: 'telegram-bot',
      timestamp: new Date().toISOString(),
    };
  }
}
