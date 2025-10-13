import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentService } from './agent.service';
import { AgentStreamService } from './agent-stream.service';
import { WorkflowService } from './workflows';

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
  ],
  providers: [AgentService, AgentStreamService, WorkflowService],
  exports: [AgentService, AgentStreamService, WorkflowService],
})
export class AgentModule {}
