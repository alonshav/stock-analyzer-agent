import { EventEmitter } from 'events';
import { EventSource } from 'eventsource';

/**
 * SSE Client Configuration
 */
export interface SSEClientConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Generic SSE Event
 */
export interface SSEEvent {
  type: string;
  data: any;
  timestamp?: string;
}

/**
 * SSEClientService - Generic Server-Sent Events Client
 *
 * SINGLE RESPONSIBILITY: Manage EventSource connections and emit events
 *
 * Does NOT:
 * - Format messages
 * - Handle business logic
 * - Know about Telegram, tools, or domain concepts
 *
 * Does:
 * - Create and manage EventSource connections
 * - Parse SSE messages
 * - Emit events for consumers to handle
 * - Provide connection lifecycle management
 * - Clean up connections properly
 */
export class SSEClientService extends EventEmitter {
  private eventSource: EventSource | null = null;
  private connectionId: string;

  constructor(connectionId: string) {
    super();
    this.connectionId = connectionId;
  }

  /**
   * Connect to SSE endpoint
   */
  connect(config: SSEClientConfig): void {
    if (this.eventSource) {
      throw new Error('Already connected. Call disconnect() first.');
    }

    const eventSource = new EventSource(config.url, {
      method: config.method || 'GET',
      headers: config.headers || {},
      body: config.body,
    } as any);

    this.eventSource = eventSource;

    // Handle incoming messages
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const parsedEvent: SSEEvent = JSON.parse(event.data);
        this.emit('message', parsedEvent);
        this.emit(parsedEvent.type, parsedEvent.data);
      } catch (error) {
        this.emit('error', new Error(`Failed to parse SSE message: ${error}`));
      }
    };

    // Handle errors
    eventSource.onerror = (error: any) => {
      if (eventSource.readyState === EventSource.CLOSED) {
        this.emit('close');
      } else {
        this.emit('error', error);
      }
    };
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.emit('disconnect');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }

  /**
   * Get connection ID
   */
  getConnectionId(): string {
    return this.connectionId;
  }
}
