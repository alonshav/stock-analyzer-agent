import { Controller, Get, Param, Query, Res, Req, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { StreamService } from '@stock-analyzer/agent/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreamResponse } from './dto/analysis.dto';

@Controller('api/analyze')
export class SSEController {
  private readonly logger = new Logger(SSEController.name);

  constructor(
    private streamService: StreamService,
    private eventEmitter: EventEmitter2
  ) {}

  @Get(':ticker/stream')
  async streamAnalysis(
    @Param('ticker') ticker: string,
    @Query('userId') userId = 'anonymous',
    @Query('sessionId') sessionId: string,
    @Query('platform') platform = 'web',
    @Query('prompt') userPrompt: string,
    @Res() res: Response,
    @Req() req: Request
  ) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    let streamId: string;

    try {
      streamId = await this.streamService.startAnalysisStream({
        ticker: ticker.toUpperCase(),
        userPrompt: userPrompt || `Analyze ${ticker} using Framework v2.3`,
        userId,
        sessionId: sessionId || `sse-${Date.now()}`,
        platform,
        options: { generatePDF: true },
      });

      // Send connection event
      const connectionResponse: StreamResponse = {
        type: 'connected',
        streamId,
        ticker: ticker.toUpperCase(),
      };
      res.write(`data: ${JSON.stringify(connectionResponse)}\n\n`);

      // Event listeners
      const chunkListener = (data: any) => {
        const chunkResponse: StreamResponse = {
          type: 'chunk',
          ...data,
        };
        res.write(`data: ${JSON.stringify(chunkResponse)}\n\n`);
      };

      const toolListener = (data: any) => {
        const toolResponse: StreamResponse = {
          type: 'tool',
          ...data,
        };
        res.write(`data: ${JSON.stringify(toolResponse)}\n\n`);
      };

      const thinkingListener = (data: any) => {
        const thinkingResponse: StreamResponse = {
          type: 'thinking',
          ...data,
        };
        res.write(`data: ${JSON.stringify(thinkingResponse)}\n\n`);
      };

      const pdfListener = (data: any) => {
        const pdfResponse: StreamResponse = {
          type: 'pdf',
          ...data,
        };
        res.write(`data: ${JSON.stringify(pdfResponse)}\n\n`);
      };

      const completeListener = (data: any) => {
        const completeResponse: StreamResponse = {
          type: 'complete',
          ticker: data.ticker,
          metadata: data.metadata,
          // Don't send executiveSummary - already streamed as chunks
        };
        res.write(`data: ${JSON.stringify(completeResponse)}\n\n`);
        res.end();
      };

      const errorListener = (data: any) => {
        const errorResponse: StreamResponse = {
          type: 'error',
          message: data.message,
          timestamp: data.timestamp,
        };
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.end();
      };

      // Register event listeners
      this.eventEmitter.on(`analysis.chunk.${streamId}`, chunkListener);
      this.eventEmitter.on(`analysis.tool.${streamId}`, toolListener);
      this.eventEmitter.on(`analysis.thinking.${streamId}`, thinkingListener);
      this.eventEmitter.on(`analysis.pdf.${streamId}`, pdfListener);
      this.eventEmitter.on(`analysis.complete.${streamId}`, completeListener);
      this.eventEmitter.on(`analysis.error.${streamId}`, errorListener);

      // Handle client disconnect
      req.on('close', () => {
        this.logger.log(`Client disconnected: ${ticker}`);
        this.eventEmitter.removeListener(`analysis.chunk.${streamId}`, chunkListener);
        this.eventEmitter.removeListener(`analysis.tool.${streamId}`, toolListener);
        this.eventEmitter.removeListener(`analysis.thinking.${streamId}`, thinkingListener);
        this.eventEmitter.removeListener(`analysis.pdf.${streamId}`, pdfListener);
        this.eventEmitter.removeListener(`analysis.complete.${streamId}`, completeListener);
        this.eventEmitter.removeListener(`analysis.error.${streamId}`, errorListener);
        this.streamService.endSession(streamId);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('SSE error:', errorMessage);
      const errorResponse: StreamResponse = {
        type: 'error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }

  @Get('stream/status')
  getStreamStatus() {
    return {
      activeSessions: this.streamService.getActiveSessionsCount(),
      sessions: this.streamService.getAllActiveSessions(),
      timestamp: new Date().toISOString(),
    };
  }
}
