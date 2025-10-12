import { AnalysisOptions, AnalysisResult } from '@stock-analyzer/agent/core';

/**
 * REST API request/response types
 * NOTE: SSE stream event types are now in @stock-analyzer/shared/types
 * (StreamEventPayload, ChunkEvent, ToolEvent, etc.)
 */

export interface AnalysisRequest {
  ticker: string;
  prompt: string;
  options?: AnalysisOptions;
}

export interface AnalysisResponse {
  analysisId: string;
  status: 'processing' | 'complete' | 'error';
  ticker: string;
  startTime?: number;
  completionTime?: number;
  result?: AnalysisResult;
  error?: string;
}
