import { Injectable, Logger } from '@nestjs/common';
import { getWorkflowConfig } from './workflow-registry';
import { WorkflowType, WorkflowParams } from '@stock-analyzer/shared/types';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  buildUserPrompt(workflowType: WorkflowType, params: WorkflowParams): string {
    const config = getWorkflowConfig(workflowType);

    // Build user prompt based on workflow type
    let prompt = `Analyze ${params.ticker}`;

    if (params.userPrompt) {
      prompt += `\n\n${params.userPrompt}`;
    }

    if (params.additionalContext) {
      prompt += `\n\nAdditional context: ${JSON.stringify(params.additionalContext)}`;
    }

    this.logger.log(
      `Built prompt for workflow ${workflowType}: ${prompt.substring(0, 100)}...`
    );

    return prompt;
  }

  getConfig(workflowType: WorkflowType) {
    return getWorkflowConfig(workflowType);
  }
}
