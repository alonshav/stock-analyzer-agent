import { Controller, Get, Param, Query, Res, Req, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { StreamService } from '@stock-analyzer/agent/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createEventName,
  StreamEventType,
  FRAMEWORK_VERSION,
  StreamEventPayload,
  ChunkEvent,
  ToolEvent,
  ThinkingEvent,
  ToolResultEvent,
  PDFEvent,
  ResultEvent,
  SystemEvent,
  CompactionEvent,
  PartialEvent,
  CompleteEvent,
  ErrorEvent,
  ConnectedEvent,
} from '@stock-analyzer/shared/types';

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
        userPrompt: userPrompt || `Analyze ${ticker} using Framework ${FRAMEWORK_VERSION}`,
        userId,
        sessionId: sessionId || `sse-${Date.now()}`,
        platform,
        options: { generatePDF: true },
      });

      // Send connection event
      const connectionResponse: ConnectedEvent = {
        type: StreamEventType.CONNECTED,
        streamId,
        ticker: ticker.toUpperCase(),
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(connectionResponse)}\n\n`);

      // Event listeners with proper types
      const chunkListener = (data: Omit<ChunkEvent, 'type'>) => {
        const chunkResponse: ChunkEvent = {
          type: StreamEventType.CHUNK,
          ...data,
        };
        res.write(`data: ${JSON.stringify(chunkResponse)}\n\n`);
      };

      const toolListener = (data: Omit<ToolEvent, 'type'>) => {
        const toolResponse: ToolEvent = {
          type: StreamEventType.TOOL,
          ...data,
        };
        res.write(`data: ${JSON.stringify(toolResponse)}\n\n`);
      };

      const thinkingListener = (data: Omit<ThinkingEvent, 'type'>) => {
        const thinkingResponse: ThinkingEvent = {
          type: StreamEventType.THINKING,
          ...data,
        };
        res.write(`data: ${JSON.stringify(thinkingResponse)}\n\n`);
      };

      const toolResultListener = (data: Omit<ToolResultEvent, 'type'>) => {
        const toolResultResponse: ToolResultEvent = {
          type: StreamEventType.TOOL_RESULT,
          ...data,
        };
        res.write(`data: ${JSON.stringify(toolResultResponse)}\n\n`);
      };

      const pdfListener = (data: Omit<PDFEvent, 'type'>) => {
        const pdfResponse: PDFEvent = {
          type: StreamEventType.PDF,
          ...data,
        };
        res.write(`data: ${JSON.stringify(pdfResponse)}\n\n`);
      };

      const resultListener = (data: Omit<ResultEvent, 'type'>) => {
        const resultResponse: ResultEvent = {
          type: StreamEventType.RESULT,
          ...data,
        };
        res.write(`data: ${JSON.stringify(resultResponse)}\n\n`);
      };

      const systemListener = (data: Omit<SystemEvent, 'type'>) => {
        const systemResponse: SystemEvent = {
          type: StreamEventType.SYSTEM,
          ...data,
        };
        res.write(`data: ${JSON.stringify(systemResponse)}\n\n`);
      };

      const compactionListener = (data: Omit<CompactionEvent, 'type'>) => {
        const compactionResponse: CompactionEvent = {
          type: StreamEventType.COMPACTION,
          ...data,
        };
        res.write(`data: ${JSON.stringify(compactionResponse)}\n\n`);
      };

      const partialListener = (data: Omit<PartialEvent, 'type'>) => {
        const partialResponse: PartialEvent = {
          type: StreamEventType.PARTIAL,
          ...data,
        };
        res.write(`data: ${JSON.stringify(partialResponse)}\n\n`);
      };

      const completeListener = (data: Omit<CompleteEvent, 'type'>) => {
        const completeResponse: CompleteEvent = {
          type: StreamEventType.COMPLETE,
          ticker: data.ticker,
          timestamp: data.timestamp,
          metadata: data.metadata,
          // Don't send executiveSummary - already streamed as chunks
        };
        res.write(`data: ${JSON.stringify(completeResponse)}\n\n`);
        res.end();
      };

      const errorListener = (data: Omit<ErrorEvent, 'type'>) => {
        const errorResponse: ErrorEvent = {
          type: StreamEventType.ERROR,
          message: data.message,
          timestamp: data.timestamp,
        };
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.end();
      };

      // Register event listeners using enum-based names
      this.eventEmitter.on(createEventName(StreamEventType.CHUNK, streamId), chunkListener);
      this.eventEmitter.on(createEventName(StreamEventType.TOOL, streamId), toolListener);
      this.eventEmitter.on(createEventName(StreamEventType.THINKING, streamId), thinkingListener);
      this.eventEmitter.on(createEventName(StreamEventType.TOOL_RESULT, streamId), toolResultListener);
      this.eventEmitter.on(createEventName(StreamEventType.PDF, streamId), pdfListener);
      this.eventEmitter.on(createEventName(StreamEventType.RESULT, streamId), resultListener);
      this.eventEmitter.on(createEventName(StreamEventType.SYSTEM, streamId), systemListener);
      this.eventEmitter.on(createEventName(StreamEventType.COMPACTION, streamId), compactionListener);
      this.eventEmitter.on(createEventName(StreamEventType.PARTIAL, streamId), partialListener);
      this.eventEmitter.on(createEventName(StreamEventType.COMPLETE, streamId), completeListener);
      this.eventEmitter.on(createEventName(StreamEventType.ERROR, streamId), errorListener);

      // Handle client disconnect
      req.on('close', () => {
        this.logger.log(`Client disconnected: ${ticker}`);
        this.eventEmitter.removeListener(createEventName(StreamEventType.CHUNK, streamId), chunkListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.TOOL, streamId), toolListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.THINKING, streamId), thinkingListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.TOOL_RESULT, streamId), toolResultListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.PDF, streamId), pdfListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.RESULT, streamId), resultListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.SYSTEM, streamId), systemListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.COMPACTION, streamId), compactionListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.PARTIAL, streamId), partialListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.COMPLETE, streamId), completeListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.ERROR, streamId), errorListener);
        this.streamService.endSession(streamId);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('SSE error:', errorMessage);
      const errorResponse: ErrorEvent = {
        type: StreamEventType.ERROR,
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

  @Get('conversation/:chatId/stream')
  async streamConversation(
    @Param('chatId') chatId: string,
    @Query('message') message: string,
    @Query('userId') userId = 'anonymous',
    @Query('platform') platform = 'telegram',
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
      // Use the existing stream service with chatId as sessionId
      streamId = await this.streamService.startConversationStream({
        chatId,
        message,
        userId,
        platform,
      });

      // Send connection event
      const connectionResponse: ConnectedEvent = {
        type: StreamEventType.CONNECTED,
        streamId,
        ticker: chatId, // Use chatId as ticker for conversation mode
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(connectionResponse)}\n\n`);

      // Event listeners with proper types (same as analysis stream)
      const chunkListener = (data: Omit<ChunkEvent, 'type'>) => {
        const chunkResponse: ChunkEvent = {
          type: StreamEventType.CHUNK,
          ...data,
        };
        res.write(`data: ${JSON.stringify(chunkResponse)}\n\n`);
      };

      const thinkingListener = (data: Omit<ThinkingEvent, 'type'>) => {
        const thinkingResponse: ThinkingEvent = {
          type: StreamEventType.THINKING,
          ...data,
        };
        res.write(`data: ${JSON.stringify(thinkingResponse)}\n\n`);
      };

      const toolListener = (data: Omit<ToolEvent, 'type'>) => {
        const toolResponse: ToolEvent = {
          type: StreamEventType.TOOL,
          ...data,
        };
        res.write(`data: ${JSON.stringify(toolResponse)}\n\n`);
      };

      const toolResultListener = (data: Omit<ToolResultEvent, 'type'>) => {
        const toolResultResponse: ToolResultEvent = {
          type: StreamEventType.TOOL_RESULT,
          ...data,
        };
        res.write(`data: ${JSON.stringify(toolResultResponse)}\n\n`);
      };

      const resultListener = (data: Omit<ResultEvent, 'type'>) => {
        const resultResponse: ResultEvent = {
          type: StreamEventType.RESULT,
          ...data,
        };
        res.write(`data: ${JSON.stringify(resultResponse)}\n\n`);
      };

      const systemListener = (data: Omit<SystemEvent, 'type'>) => {
        const systemResponse: SystemEvent = {
          type: StreamEventType.SYSTEM,
          ...data,
        };
        res.write(`data: ${JSON.stringify(systemResponse)}\n\n`);
      };

      const compactionListener = (data: Omit<CompactionEvent, 'type'>) => {
        const compactionResponse: CompactionEvent = {
          type: StreamEventType.COMPACTION,
          ...data,
        };
        res.write(`data: ${JSON.stringify(compactionResponse)}\n\n`);
      };

      const partialListener = (data: Omit<PartialEvent, 'type'>) => {
        const partialResponse: PartialEvent = {
          type: StreamEventType.PARTIAL,
          ...data,
        };
        res.write(`data: ${JSON.stringify(partialResponse)}\n\n`);
      };

      const completeListener = (data: Omit<CompleteEvent, 'type'>) => {
        const completeResponse: CompleteEvent = {
          type: StreamEventType.COMPLETE,
          ticker: data.ticker || chatId,
          timestamp: data.timestamp,
          metadata: data.metadata,
        };
        res.write(`data: ${JSON.stringify(completeResponse)}\n\n`);
        res.end();
      };

      const errorListener = (data: Omit<ErrorEvent, 'type'>) => {
        const errorResponse: ErrorEvent = {
          type: StreamEventType.ERROR,
          message: data.message,
          timestamp: data.timestamp,
        };
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.end();
      };

      // Register event listeners
      this.eventEmitter.on(createEventName(StreamEventType.CHUNK, streamId), chunkListener);
      this.eventEmitter.on(createEventName(StreamEventType.THINKING, streamId), thinkingListener);
      this.eventEmitter.on(createEventName(StreamEventType.TOOL, streamId), toolListener);
      this.eventEmitter.on(createEventName(StreamEventType.TOOL_RESULT, streamId), toolResultListener);
      this.eventEmitter.on(createEventName(StreamEventType.RESULT, streamId), resultListener);
      this.eventEmitter.on(createEventName(StreamEventType.SYSTEM, streamId), systemListener);
      this.eventEmitter.on(createEventName(StreamEventType.COMPACTION, streamId), compactionListener);
      this.eventEmitter.on(createEventName(StreamEventType.PARTIAL, streamId), partialListener);
      this.eventEmitter.on(createEventName(StreamEventType.COMPLETE, streamId), completeListener);
      this.eventEmitter.on(createEventName(StreamEventType.ERROR, streamId), errorListener);

      // Handle client disconnect
      req.on('close', () => {
        this.logger.log(`Conversation client disconnected: ${chatId}`);
        this.eventEmitter.removeListener(createEventName(StreamEventType.CHUNK, streamId), chunkListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.THINKING, streamId), thinkingListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.TOOL, streamId), toolListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.TOOL_RESULT, streamId), toolResultListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.RESULT, streamId), resultListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.SYSTEM, streamId), systemListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.COMPACTION, streamId), compactionListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.PARTIAL, streamId), partialListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.COMPLETE, streamId), completeListener);
        this.eventEmitter.removeListener(createEventName(StreamEventType.ERROR, streamId), errorListener);
        this.streamService.endSession(streamId);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Conversation SSE error:', errorMessage);
      const errorResponse: ErrorEvent = {
        type: StreamEventType.ERROR,
        message: errorMessage,
        timestamp: new Date().toISOString(),
      };
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }
}
