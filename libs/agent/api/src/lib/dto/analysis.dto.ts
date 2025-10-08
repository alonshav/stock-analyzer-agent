import { AnalysisOptions, AnalysisResult } from '@stock-analyzer/agent/core';

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

export interface StreamConnectionResponse {
  type: 'connected';
  streamId: string;
  ticker: string;
}

export interface StreamChunkResponse {
  type: 'chunk';
  ticker: string;
  content: string;
  phase: string;
  timestamp: string;
}

export interface StreamToolResponse {
  type: 'tool';
  ticker: string;
  toolName: string;
  toolId: string;
  timestamp: string;
}

export interface StreamCompleteResponse {
  type: 'complete';
  ticker: string;
  fullAnalysis: string;
  executiveSummary: string;
  metadata: {
    analysisDate: string;
    framework: string;
    model: string;
    duration: number;
  };
}

export interface StreamErrorResponse {
  type: 'error';
  message: string;
  timestamp: string;
}

export type StreamResponse =
  | StreamConnectionResponse
  | StreamChunkResponse
  | StreamToolResponse
  | StreamCompleteResponse
  | StreamErrorResponse;
