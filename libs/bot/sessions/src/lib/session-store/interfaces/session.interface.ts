export enum SessionStatus {
  ACTIVE = 'active', // Default state - session is active
  STOPPED = 'stopped', // Manually ended via /new or /reset
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface WorkflowExecution {
  workflowId: string;
  workflowType: string; // From WorkflowType enum
  ticker?: string; // Some workflows are ticker-specific
  startedAt: Date;
  completedAt?: Date;
  result?: string; // Workflow output/summary
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  sessionId: string; // Format: "chat123-1234567890" (no ticker)
  chatId: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  conversationHistory: ConversationMessage[];
  workflows: WorkflowExecution[]; // Track workflows executed in this session
  metadata?: Record<string, unknown>;
}
