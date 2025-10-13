import { WorkflowType, WorkflowParams } from '@stock-analyzer/shared/types';

/**
 * Workflow API DTOs
 *
 * Bot creates session first, then calls workflow endpoint with sessionId
 */

export interface WorkflowRequest {
  sessionId: string; // Created by Bot's SessionOrchestrator
  workflowType: WorkflowType;
  params: WorkflowParams; // { ticker, userPrompt?, additionalContext? }
}

export interface WorkflowResponse {
  sessionId: string;
  status: 'processing';
  ticker: string;
  workflowType: string;
}

export interface WorkflowStatusResponse {
  sessionId: string;
  status: 'processing' | 'complete' | 'error';
  ticker: string;
  workflowType: string;
  error?: string;
}
