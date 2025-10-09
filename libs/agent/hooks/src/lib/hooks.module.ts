import { Module } from '@nestjs/common';
import { HooksService } from './hooks.service';
import { SessionManagerModule } from '@stock-analyzer/agent/session';

@Module({
  imports: [SessionManagerModule],
  controllers: [],
  providers: [HooksService],
  exports: [HooksService],
})
export class HooksModule {}
