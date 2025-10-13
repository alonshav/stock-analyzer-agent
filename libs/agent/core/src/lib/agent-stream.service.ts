import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response } from 'express';
import {
  createEventName,
  StreamEventType,
  StreamEventPayload,
} from '@stock-analyzer/shared/types';

/**
 * AgentStreamService - SSE Connection Manager
 *
 * NEW ARCHITECTURE:
 * - Simple SSE connection registry (sessionId → Response)
 * - Listens to EventEmitter events from AgentService
 * - Forwards events to connected SSE clients
 * - No workflow/conversation logic (that's in AgentService)
 *
 * MEMORY LEAK PREVENTION:
 * - Implements OnModuleDestroy for cleanup
 * - Stores event listener references for removal
 * - Detects connection closes to clean up orphaned streams
 * - Removes all listeners and closes all streams on destroy
 */
@Injectable()
export class AgentStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentStreamService.name);
  private readonly activeStreams = new Map<string, Response>();
  private readonly eventListeners: Array<{ event: string; listener: (...args: any[]) => void }> = [];

  constructor(private eventEmitter: EventEmitter2) {
    this.setupEventListeners();
  }

  /**
   * NestJS lifecycle hook - Clean up resources on module destroy
   * Prevents memory leaks by removing all event listeners and closing streams
   */
  onModuleDestroy(): void {
    this.logger.log('Cleaning up AgentStreamService...');

    // Remove all event listeners
    for (const { event, listener } of this.eventListeners) {
      this.eventEmitter.off(event, listener);
      this.logger.debug(`Removed event listener for: ${event}`);
    }
    this.eventListeners.length = 0;

    // Close all active streams
    const streamCount = this.activeStreams.size;
    for (const [sessionId, res] of this.activeStreams.entries()) {
      try {
        res.end();
      } catch (error) {
        this.logger.error(`[${sessionId}] Error closing stream:`, error);
      }
    }
    this.activeStreams.clear();

    this.logger.log(`Cleanup complete - removed ${this.eventListeners.length} listeners and closed ${streamCount} streams`);
  }

  /**
   * Register SSE connection for a session
   * @param sessionId - Session ID from Bot
   * @param res - Express Response object for SSE
   */
  registerStream(sessionId: string, res: Response): void {
    this.activeStreams.set(sessionId, res);
    this.logger.log(`[${sessionId}] SSE stream registered (total: ${this.activeStreams.size})`);

    // Detect connection close to prevent memory leaks
    res.on('close', () => {
      this.logger.log(`[${sessionId}] Connection closed by client`);
      this.activeStreams.delete(sessionId);
    });

    res.on('error', (error) => {
      this.logger.error(`[${sessionId}] Connection error:`, error);
      this.activeStreams.delete(sessionId);
    });
  }

  /**
   * Close SSE connection for a session
   * @param sessionId - Session ID to close
   */
  closeStream(sessionId: string): void {
    const res = this.activeStreams.get(sessionId);
    if (res) {
      try {
        res.end();
      } catch (error) {
        this.logger.error(`[${sessionId}] Error ending stream:`, error);
      }
      this.activeStreams.delete(sessionId);
      this.logger.log(`[${sessionId}] SSE stream closed (remaining: ${this.activeStreams.size})`);
    }
  }

  /**
   * Check if session has active SSE stream
   */
  hasActiveStream(sessionId: string): boolean {
    return this.activeStreams.has(sessionId);
  }

  /**
   * Get count of active SSE streams
   */
  getActiveStreamsCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Setup EventEmitter listeners for all stream events
   * Forwards events from AgentService to SSE clients
   * Stores listener references for cleanup
   */
  private setupEventListeners(): void {
    // Create listener function and store reference
    // Event pattern: stream.{sessionId}
    // Payload contains sessionId, ticker, type, and event-specific data
    const streamListener = (payload: StreamEventPayload) => {
      // Extract sessionId from payload (all events have it via BaseEvent or directly)
      const sessionId = 'sessionId' in payload ? payload.sessionId : undefined;
      if (!sessionId) {
        this.logger.warn(`Event received without sessionId: ${payload.type}`);
        return;
      }
      this.forwardEventToClient(sessionId, payload);
    };

    // Register listener for stream.* pattern (all stream events)
    this.eventEmitter.on('stream.*', streamListener);

    // Store reference for cleanup
    this.eventListeners.push({
      event: 'stream.*',
      listener: streamListener,
    });

    this.logger.debug('Event listeners registered');
  }

  /**
   * Forward event to SSE client
   */
  private forwardEventToClient(sessionId: string, payload: StreamEventPayload): void {
    const res = this.activeStreams.get(sessionId);
    if (!res) {
      this.logger.debug(`[${sessionId}] No active stream for event: ${payload.type}`);
      return;
    }

    try {
      // Payload already includes type field from agent.service
      const eventData = JSON.stringify(payload);
      res.write(`data: ${eventData}\n\n`);
      this.logger.debug(`[${sessionId}] Forwarded event: ${payload.type}`);
    } catch (error) {
      this.logger.error(`[${sessionId}] Failed to forward event:`, error);
      this.closeStream(sessionId);
    }
  }
}
