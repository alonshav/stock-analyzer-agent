import { Module } from '@nestjs/common';
import { AgentModule } from '@stock-analyzer/agent/core';
import { AnalysisController } from './analysis.controller';

@Module({
  imports: [AgentModule],
  controllers: [AnalysisController],
  exports: [],
})
export class ApiModule {}
