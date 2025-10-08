import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AgentService } from '@stock-analyzer/agent/core';
import { v4 as uuidv4 } from 'uuid';
import { AnalysisRequest, AnalysisResponse } from './dto/analysis.dto';

@Controller('api/analyze')
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);
  private readonly analysisCache = new Map<string, AnalysisResponse>();

  constructor(private agentService: AgentService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async startAnalysis(@Body() body: AnalysisRequest) {
    const analysisId = uuidv4();
    const ticker = body.ticker.toUpperCase();

    this.analysisCache.set(analysisId, {
      analysisId,
      status: 'processing',
      ticker,
      startTime: Date.now(),
    });

    this.logger.log(`Starting analysis ${analysisId} for ${ticker}`);

    // Start analysis in background
    this.agentService
      .analyzeStock(ticker, body.prompt, body.options)
      .then((result) => {
        this.analysisCache.set(analysisId, {
          analysisId,
          status: 'complete',
          ticker,
          result,
          completionTime: Date.now(),
        });
        this.logger.log(`Analysis ${analysisId} completed`);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.analysisCache.set(analysisId, {
          analysisId,
          status: 'error',
          ticker,
          error: errorMessage,
          completionTime: Date.now(),
        });
        this.logger.error(`Analysis ${analysisId} failed: ${errorMessage}`);
      });

    return {
      analysisId,
      status: 'processing',
      ticker,
    };
  }

  @Get('status/:id')
  getAnalysisStatus(@Param('id') id: string) {
    const analysis = this.analysisCache.get(id);
    if (!analysis) {
      return { error: 'Analysis not found' };
    }

    // Return status without full result
    return {
      analysisId: analysis.analysisId,
      status: analysis.status,
      ticker: analysis.ticker,
      startTime: analysis.startTime,
      completionTime: analysis.completionTime,
    };
  }

  @Get('report/:id')
  getAnalysisReport(@Param('id') id: string) {
    const analysis = this.analysisCache.get(id);
    if (!analysis) {
      return { error: 'Analysis not found' };
    }
    if (analysis.status !== 'complete') {
      return {
        status: analysis.status,
        message:
          analysis.status === 'processing'
            ? 'Analysis still in progress'
            : 'Analysis failed',
        error: analysis.error,
      };
    }
    return analysis.result;
  }
}
