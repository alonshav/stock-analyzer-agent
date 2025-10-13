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

/**
 * Workflow Controller - Streaming API
 *
 * NEW ARCHITECTURE:
 * - Bot creates session using SessionOrchestrator
 * - Bot POSTs to /api/workflow with {sessionId, workflowType, params}
 * - Agent STREAMS results directly via SSE from this POST endpoint
 * - Bot processes SSE events in real-time
 * - Bot manages session lifecycle (complete, stop, expire)
 *
 * Agent is stateless - it receives sessionId from Bot and streams back results.
 */
@Controller('api/workflow')
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(
    private agentService: AgentService,
    private streamService: AgentStreamService
  ) {}

  /**
   * Execute Workflow with SSE Streaming
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
  @Post()
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
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      sessionId,
      ticker,
      workflowType,
      timestamp: new Date().toISOString()
    })}\n\n`);

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
        res.write(`data: ${JSON.stringify({
          type: 'error',
          ticker,
          message: errorMessage,
          timestamp: new Date().toISOString()
        })}\n\n`);

        // Clean up
        this.streamService.closeStream(sessionId);
      });

    // Handle client disconnect
    req.on('close', () => {
      this.logger.log(`[${sessionId}] Client disconnected`);
      this.streamService.closeStream(sessionId);
    });
  }
}
