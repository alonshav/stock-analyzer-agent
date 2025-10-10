import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentService, AnalysisOptions } from './agent.service';

export interface StreamSession {
  id: string;
  ticker: string;
  userId: string;
  platform: string;
  startTime: number;
  active: boolean;
}

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly sessions = new Map<string, StreamSession>();

  constructor(
    private agentService: AgentService,
    private eventEmitter: EventEmitter2
  ) {}

  async startAnalysisStream(params: {
    ticker: string;
    userPrompt: string;
    userId: string;
    sessionId: string;
    platform: string;
    options?: AnalysisOptions;
  }): Promise<string> {
    // Create unique stream ID
    const streamId = `${params.sessionId}-${Date.now()}`;

    // Create and store session metadata
    const session: StreamSession = {
      id: streamId,
      ticker: params.ticker,
      userId: params.userId,
      platform: params.platform,
      startTime: Date.now(),
      active: true,
    };
    this.sessions.set(streamId, session);

    this.logger.log(`Started stream: ${streamId} for ${params.ticker}`);

    // Extract chatId from sessionId (format: "telegram-{chatId}")
    // This ensures the session is created with the correct chatId for conversation mode
    const chatId = params.sessionId.startsWith('telegram-')
      ? params.sessionId.substring('telegram-'.length)
      : params.sessionId;

    this.logger.debug(`[${streamId}] Extracted chatId: "${chatId}" from sessionId: "${params.sessionId}"`);

    // Start agent analysis (runs in background)
    // Agent will emit events that SSE controller listens to directly
    this.agentService
      .analyzeStock(
        chatId,              // chatId extracted from sessionId
        params.ticker,
        params.userPrompt,
        params.options,
        streamId // Agent uses this in event names
      )
      .then(() => {
        this.endSession(streamId);
      })
      .catch((error) => {
        this.logger.error(`Stream error: ${error.message}`, error.stack);
        this.eventEmitter.emit(`analysis.error.${streamId}`, {
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        this.endSession(streamId);
      });

    return streamId;
  }

  async startConversationStream(params: {
    chatId: string;
    message: string;
    userId: string;
    platform: string;
  }): Promise<string> {
    // Create unique stream ID for conversation
    const streamId = `conversation-${params.chatId}-${Date.now()}`;

    // Create and store session metadata
    const session: StreamSession = {
      id: streamId,
      ticker: params.chatId, // Use chatId as ticker for conversation mode
      userId: params.userId,
      platform: params.platform,
      startTime: Date.now(),
      active: true,
    };
    this.sessions.set(streamId, session);

    this.logger.log(`Started conversation stream: ${streamId} for chat ${params.chatId}`);

    // Start conversation handling (runs in background)
    this.agentService
      .handleConversation(
        params.chatId,
        params.message,
        streamId // Pass streamId for event emission
      )
      .then(() => {
        this.endSession(streamId);
      })
      .catch((error) => {
        this.logger.error(`Conversation stream error: ${error.message}`, error.stack);
        this.eventEmitter.emit(`analysis.error.${streamId}`, {
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        this.endSession(streamId);
      });

    return streamId;
  }

  getSession(streamId: string): StreamSession | undefined {
    return this.sessions.get(streamId);
  }

  endSession(streamId: string): void {
    const session = this.sessions.get(streamId);
    if (session) {
      session.active = false;
      this.sessions.delete(streamId);
      this.logger.log(`Ended stream: ${streamId}`);
    }
  }

  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  getAllActiveSessions(): StreamSession[] {
    return Array.from(this.sessions.values());
  }
}
