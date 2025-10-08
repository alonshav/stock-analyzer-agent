import { Module } from '@nestjs/common';
import { AgentModule } from '@stock-analyzer/agent/core';
import { AnalysisController } from './analysis.controller';
import { SSEController } from './sse.controller';

@Module({
  imports: [AgentModule],
  controllers: [AnalysisController, SSEController],
  exports: [],
})
export class ApiModule {}
