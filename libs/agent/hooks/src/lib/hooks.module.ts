import { Module } from '@nestjs/common';
import { HooksService } from './hooks.service';
import { SessionManagerModule } from 'session-manager';

@Module({
  imports: [SessionManagerModule],
  controllers: [],
  providers: [HooksService],
  exports: [HooksService],
})
export class HooksModule {}
