import { Module } from '@nestjs/common';
import { SessionManagerService } from './session-manager.service';

@Module({
  controllers: [],
  providers: [SessionManagerService],
  exports: [SessionManagerService],
})
export class SessionManagerModule {}
