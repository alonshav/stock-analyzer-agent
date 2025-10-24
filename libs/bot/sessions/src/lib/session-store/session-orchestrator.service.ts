import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from './interfaces/session-repository.interface';
import {
  ChatSession,
  SessionStatus,
  MessageRole,
  WorkflowExecution,
} from './interfaces/session.interface';

@Injectable()
export class SessionOrchestrator {
  private readonly logger = new Logger(SessionOrchestrator.name);
  private readonly STOPPED_SESSION_CLEANUP_DAYS = 7; // Clean up STOPPED sessions after 7 days

  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository
  ) {}

  /**
   * Get or create session for a chat.
   * Always returns an ACTIVE session.
   * If no session exists or previous was STOPPED, creates a new one.
   */
  getOrCreateSession(chatId: string): ChatSession {
    // Check for existing ACTIVE session
    const existing = this.sessionRepository.getSession(chatId);
    if (existing && existing.status === SessionStatus.ACTIVE) {
      this.logger.log(`Using existing session ${existing.sessionId} for chat ${chatId}`);
      return existing;
    }

    // Create new session
    this.logger.log(`Creating new session for chat ${chatId}`);
    const sessionId = this.generateSessionId(chatId);
    const newSession: ChatSession = {
      sessionId,
      chatId,
      status: SessionStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      conversationHistory: [],
      workflows: [],
      metadata: {},
    };

    this.sessionRepository.saveSession(newSession);
    return newSession;
  }

  /**
   * Get current session (returns null if STOPPED or doesn't exist)
   */
  getSession(chatId: string): ChatSession | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status === SessionStatus.ACTIVE ? session : null;
  }

  /**
   * Stop session (sets status to STOPPED)
   */
  stopSession(chatId: string, reason?: string): void {
    const session = this.sessionRepository.getSession(chatId);
    if (!session) {
      this.logger.warn(`No session found for chat ${chatId}`);
      return;
    }

    this.logger.log(
      `Stopping session ${session.sessionId} for chat ${chatId}` +
        (reason ? `: ${reason}` : '')
    );

    session.status = SessionStatus.STOPPED;
    session.updatedAt = new Date();
    if (reason && session.metadata) {
      session.metadata['stopReason'] = reason;
    }

    this.sessionRepository.saveSession(session);
  }

  /**
   * Track workflow execution within session
   * Creates a workflow record, doesn't execute it
   */
  trackWorkflow(
    chatId: string,
    workflowType: string,
    ticker?: string
  ): string {
    const session = this.getSession(chatId);
    if (!session) {
      throw new Error(`No active session found for chat ${chatId}`);
    }

    const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const execution: WorkflowExecution = {
      workflowId,
      workflowType,
      ticker,
      startedAt: new Date(),
    };

    session.workflows.push(execution);
    session.updatedAt = new Date();
    this.sessionRepository.saveSession(session);

    this.logger.log(
      `Tracked workflow ${workflowId} (${workflowType}) for session ${session.sessionId}`
    );

    return workflowId;
  }

  /**
   * Mark workflow as completed
   *
   * CRITICAL: Also adds workflow analysis to conversation history
   * This enables follow-up questions about the analysis results
   */
  completeWorkflow(
    chatId: string,
    workflowId: string,
    result: string
  ): void {
    const session = this.getSession(chatId);
    if (!session) {
      this.logger.warn(`No active session found for chat ${chatId}`);
      return;
    }

    const workflow = session.workflows.find((w) => w.workflowId === workflowId);
    if (!workflow) {
      this.logger.warn(`Workflow ${workflowId} not found in session ${session.sessionId}`);
      return;
    }

    workflow.completedAt = new Date();
    workflow.result = result;

    // CRITICAL: Add workflow analysis to conversation history
    // This enables the agent to reference the analysis in follow-up questions
    if (result) {
      const ticker = workflow.ticker || 'stock';
      const workflowType = workflow.workflowType;

      // Add implicit user prompt for context
      session.conversationHistory.push({
        role: MessageRole.USER,
        content: `Perform ${workflowType} for ${ticker}`,
        timestamp: new Date(),
      });

      // Add analysis result as assistant message
      session.conversationHistory.push({
        role: MessageRole.ASSISTANT,
        content: result,
        timestamp: new Date(),
      });

      this.logger.log(
        `Added workflow ${workflowId} analysis to conversation history (${result.length} chars)`
      );
    }

    session.updatedAt = new Date();
    this.sessionRepository.saveSession(session);

    this.logger.log(
      `Completed workflow ${workflowId} for session ${session.sessionId}`
    );
  }

  /**
   * Add message to conversation history
   */
  addMessage(
    chatId: string,
    role: MessageRole,
    content: string
  ): void {
    const session = this.getSession(chatId);
    if (!session) {
      this.logger.warn(`No active session found for chat ${chatId}`);
      return;
    }

    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });
    session.updatedAt = new Date();
    this.sessionRepository.saveSession(session);
  }

  /**
   * Get conversation history for session
   */
  getConversationHistory(chatId: string) {
    const session = this.getSession(chatId);
    return session?.conversationHistory || [];
  }

  /**
   * Cleanup old STOPPED sessions (runs daily)
   * ACTIVE sessions never expire automatically
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  private cleanupStoppedSessions(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.STOPPED_SESSION_CLEANUP_DAYS);

    const count = this.sessionRepository.cleanupOldStoppedSessions(cutoffDate);
    if (count > 0) {
      this.logger.log(
        `Cleaned up ${count} STOPPED sessions older than ${this.STOPPED_SESSION_CLEANUP_DAYS} days`
      );
    }
  }

  /**
   * Get session status
   */
  getSessionStatus(chatId: string): SessionStatus | null {
    const session = this.sessionRepository.getSession(chatId);
    return session?.status || null;
  }

  /**
   * Generate session ID (format: chat{chatId}-{timestamp})
   */
  private generateSessionId(chatId: string): string {
    return `chat${chatId}-${Date.now()}`;
  }
}
