import { STOCK_VALUATION_FRAMEWORK } from '../prompts/framework-v2.3';
import {
  SENTIMENT_WORKFLOW_PROMPT,
  DCF_VALUATION_WORKFLOW_PROMPT,
  PEER_COMPARISON_WORKFLOW_PROMPT,
  EARNINGS_WORKFLOW_PROMPT,
  NEWS_WORKFLOW_PROMPT,
} from './prompts';
import {
  WorkflowType,
  WorkflowConfig,
  AnthropicModel,
} from '@stock-analyzer/shared/types';

/**
 * Base System Prompt - Used for conversations and prepended to ALL workflows
 *
 * Provides foundational context about the agent's role, purpose, and capabilities.
 * This ensures consistent behavior across all workflow types and conversation mode.
 */
export const BASE_SYSTEM_PROMPT = `# Your Role and Purpose

You are a specialized AI financial analyst functioning as the Stock Analyzer Agent - an advanced financial analysis system designed to provide comprehensive, data-driven stock evaluations for investors and analysts.

## Core Mission

Your primary function is to analyze publicly traded companies and provide objective, actionable investment insights. You serve as a research assistant that combines quantitative analysis with qualitative assessment to help users make informed investment decisions.

## Operating Context

- **Platform**: You operate as part of a real-time streaming system, delivering analysis progressively as you work
- **Audience**: Your users are retail investors (amateurs) seeking rigorous, professional-grade stock analysis
- **Tone**: Maintain a professional, objective, and analytical tone. Be direct and data-driven
- **Tools**: You have access to real-time financial data, DCF calculation capabilities, and PDF generation
- **Constraints**: Focus exclusively on publicly traded companies with available financial data

## Key Principles

1. **Data-Driven**: Ground all conclusions in concrete financial metrics and ratios
2. **Risk-Aware**: Always highlight risks, uncertainties, and limitations in your analysis
3. **Objective**: Avoid promotional language; present balanced pros and cons
4. **Actionable**: Provide clear investment implications and price targets when possible
5. **Transparent**: Explain your reasoning and assumptions clearly, including sources of data

---

`;

// Simple key-value registry - NO switch cases!
export const WORKFLOW_CONFIGS: Record<WorkflowType, WorkflowConfig> = {
  [WorkflowType.FULL_ANALYSIS]: {
    type: WorkflowType.FULL_ANALYSIS,
    systemPrompt: STOCK_VALUATION_FRAMEWORK,
    model: AnthropicModel.HAIKU_4_5,
    maxTurns: 20,
    maxThinkingTokens: 10000,
    enabledTools: ['fetch_company_data', 'calculate_dcf'],
  },

  // Note: Conversation mode is not a workflow - it uses the base system prompt directly
  // See AgentService.executeConversation() for conversation mode implementation

  [WorkflowType.SENTIMENT]: {
    type: WorkflowType.SENTIMENT,
    systemPrompt: SENTIMENT_WORKFLOW_PROMPT,
    model: AnthropicModel.HAIKU_4_5,
    maxTurns: 15,
    maxThinkingTokens: 7000,
    enabledTools: ['fetch_company_data', 'fetch_sentiment_data'],
  },

  [WorkflowType.DCF_VALUATION]: {
    type: WorkflowType.DCF_VALUATION,
    systemPrompt: DCF_VALUATION_WORKFLOW_PROMPT,
    model: AnthropicModel.HAIKU_4_5,
    maxTurns: 15,
    maxThinkingTokens: 8000,
    enabledTools: ['fetch_company_data', 'calculate_dcf'],
  },

  [WorkflowType.PEER_COMPARISON]: {
    type: WorkflowType.PEER_COMPARISON,
    systemPrompt: PEER_COMPARISON_WORKFLOW_PROMPT,
    model: AnthropicModel.HAIKU_4_5,
    maxTurns: 15,
    maxThinkingTokens: 7000,
    enabledTools: ['fetch_company_data'],
  },

  [WorkflowType.EARNINGS]: {
    type: WorkflowType.EARNINGS,
    systemPrompt: EARNINGS_WORKFLOW_PROMPT,
    model: AnthropicModel.HAIKU_4_5,
    maxTurns: 20,
    maxThinkingTokens: 8000,
    enabledTools: ['fetch_company_data'],
  },

  [WorkflowType.NEWS]: {
    type: WorkflowType.NEWS,
    systemPrompt: NEWS_WORKFLOW_PROMPT,
    model: AnthropicModel.HAIKU_4_5,
    maxTurns: 15,
    maxThinkingTokens: 7000,
    enabledTools: ['fetch_company_data', 'fetch_news', 'fetch_sentiment_data'],
  },
};

// Helper function for lookup - Prepends base system prompt to workflow-specific prompts
export function getWorkflowConfig(type: WorkflowType): WorkflowConfig {
  const config = WORKFLOW_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown workflow type: ${type}`);
  }

  // Return config with combined system prompt (base + workflow-specific)
  return {
    ...config,
    systemPrompt: BASE_SYSTEM_PROMPT + config.systemPrompt,
  };
}
