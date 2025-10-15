import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AgentService, AgentStreamService } from '@stock-analyzer/agent/core';
import { WorkflowRequest } from './dto/workflow.dto';
import { ConversationRequestDto } from './dto/conversation.dto';

/**
 * Agent Controller - Handles workflow and conversation execution via SSE
 *
 * NEW ARCHITECTURE:
 * - Bot creates session using SessionOrchestrator
 * - Bot POSTs to /api/workflow for structured analysis
 * - Bot POSTs to /api/conversation for freeform chat
 * - Agent STREAMS results directly via SSE from both endpoints
 * - Bot processes SSE events in real-time
 * - Bot manages session lifecycle
 *
 * Agent is stateless - it receives sessionId from Bot and streams back results.
 */
@Controller('api')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private agentService: AgentService,
    private streamService: AgentStreamService
  ) {}

  /**
   * Execute Workflow with SSE Streaming
   * Route: POST /api/workflow
   *
   * Bot creates session first, then POSTs to this endpoint.
   * Agent executes workflow and streams results DIRECTLY via SSE.
   *
   * Example request:
   * POST /api/workflow
   * Headers: Accept: text/event-stream
   * Body: {
   *   "sessionId": "uuid-from-bot",
   *   "workflowType": "full_analysis",
   *   "params": {
   *     "ticker": "AAPL",
   *     "userPrompt": "Perform comprehensive analysis"
   *   }
   * }
   *
   * Response: SSE stream with events (chunk, tool, pdf, complete, error)
   */
  @Post('workflow')
  async executeWorkflow(
    @Body() body: WorkflowRequest,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const { sessionId, workflowType, params } = body;
    const ticker = params.ticker.toUpperCase();

    this.logger.log(
      `[${sessionId}] Starting workflow ${workflowType} for ${ticker} with SSE streaming`
    );

    // Set SSE status and headers (MUST be 200, not 201, for EventSource compatibility)
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Register SSE connection
    this.streamService.registerStream(sessionId, res);

    // Send connected event
    this.sendSseEvent(res, {
      type: 'connected',
      sessionId,
      ticker,
      workflowType,
      timestamp: new Date().toISOString()
    });

    // Execute workflow (results stream via EventEmitter to StreamService)
    this.agentService
      .executeWorkflow(sessionId, workflowType, params)
      .then((result) => {
        this.logger.log(
          `[${sessionId}] Workflow complete for ${ticker} (${result.metadata.duration}ms)`
        );
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `[${sessionId}] Workflow failed for ${ticker}: ${errorMessage}`
        );

        // Send error event
        this.sendSseEvent(res, {
          type: 'error',
          ticker,
          message: errorMessage,
          timestamp: new Date().toISOString()
        });

        // Clean up
        this.streamService.closeStream(sessionId);
      });

    // Handle client disconnect
    req.on('close', () => {
      this.logger.log(`[${sessionId}] Client disconnected`);
      this.streamService.closeStream(sessionId);
    });
  }

  /**
   * Execute Conversation with SSE Streaming
   * Route: POST /api/conversation (NEW)
   *
   * Bot POSTs user message with conversation history.
   * Agent executes conversation mode and streams response via SSE.
   *
   * Example request:
   * POST /api/conversation
   * Headers: Accept: text/event-stream
   * Body: {
   *   "sessionId": "uuid-from-bot",
   *   "userMessage": "What's the P/E ratio for AAPL?",
   *   "conversationHistory": [
   *     { "role": "user", "content": "...", "timestamp": "..." },
   *     { "role": "assistant", "content": "...", "timestamp": "..." }
   *   ]
   * }
   *
   * Response: SSE stream with events (chunk, thinking, tool, complete, error)
   */
  @Post('conversation')
  async executeConversation(
    @Body() body: ConversationRequestDto,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const { sessionId, userMessage, conversationHistory } = body;

    this.logger.log(
      `[${sessionId}] Starting conversation with SSE streaming`
    );

    // Set SSE headers (MUST be 200 for EventSource compatibility)
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Register SSE connection
    this.streamService.registerStream(sessionId, res);

    // Send connected event
    this.sendSseEvent(res, {
      type: 'connected',
      sessionId,
      timestamp: new Date().toISOString()
    });

    // Execute conversation (results stream via EventEmitter to StreamService)
    this.agentService
      .executeConversation(sessionId, userMessage, conversationHistory)
      .then((result) => {
        this.logger.log(`[${sessionId}] Conversation complete`);
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`[${sessionId}] Conversation failed: ${errorMessage}`);

        // Send error event
        this.sendSseEvent(res, {
          type: 'error',
          message: errorMessage,
          timestamp: new Date().toISOString()
        });

        // Clean up
        this.streamService.closeStream(sessionId);
      });

    // Handle client disconnect
    req.on('close', () => {
      this.logger.log(`[${sessionId}] Client disconnected`);
      this.streamService.closeStream(sessionId);
    });
  }

  /**
   * Helper method to send SSE events
   * Centralizes the SSE format: data: {...}\n\n
   */
  private sendSseEvent(res: Response, data: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
