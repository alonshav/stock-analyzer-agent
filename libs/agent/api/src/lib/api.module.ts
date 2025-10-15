import { Module } from '@nestjs/common';
import { AgentModule } from '@stock-analyzer/agent/core';
import { AgentController } from './agent.controller';

@Module({
  imports: [AgentModule],
  controllers: [AgentController],
  exports: [],
})
export class ApiModule {}
