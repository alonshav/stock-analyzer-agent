import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentService } from './agent.service';
import { StreamService } from './stream.service';
import { SessionManagerModule } from '@stock-analyzer/agent/session';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    SessionManagerModule,
  ],
  providers: [AgentService, StreamService],
  exports: [AgentService, StreamService],
})
export class AgentModule {}
