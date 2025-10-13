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
   *
   * Uses custom fetch implementation to support POST requests with body.
   * EventSource v4 supports this via the fetch option in constructor.
   */
  connect(config: SSEClientConfig): void {
    if (this.eventSource) {
      throw new Error('Already connected. Call disconnect() first.');
    }

    console.log(`[SSEClientService] Connecting to ${config.url}`);
    console.log(`[SSEClientService] Method: ${config.method}, Body length: ${config.body?.length}`);

    // EventSource v4 supports custom fetch implementation for POST requests
    const eventSource = new EventSource(config.url, {
      fetch: (input, init) => {
        console.log(`[SSEClientService] Custom fetch called with input:`, input);
        console.log(`[SSEClientService] Init headers:`, init?.headers);
        const fetchConfig = {
          ...init,
          method: config.method || 'GET',
          headers: {
            ...init?.headers,
            ...config.headers,
          },
          body: config.body,
        };
        console.log(`[SSEClientService] Fetch config:`, { method: fetchConfig.method, headers: fetchConfig.headers, bodyLength: fetchConfig.body?.length });
        return fetch(input, fetchConfig);
      },
    });

    this.eventSource = eventSource;

    // Handle connection open
    eventSource.addEventListener('open', () => {
      console.log(`[SSEClientService] Connection opened, readyState: ${eventSource.readyState}`);
    });

    // Handle incoming messages
    eventSource.onmessage = (event: MessageEvent) => {
      console.log(`[SSEClientService] Message received:`, event.data.substring(0, 200));
      try {
        const parsedEvent: any = JSON.parse(event.data);
        this.emit('message', parsedEvent);
        // Emit the entire parsed event (it contains type, sessionId, ticker, etc.)
        this.emit(parsedEvent.type, parsedEvent);
      } catch (error) {
        this.emit('error', new Error(`Failed to parse SSE message: ${error}`));
      }
    };

    // Handle errors
    eventSource.onerror = (error: any) => {
      console.log(`[SSEClientService] Error occurred:`, error);
      console.log(`[SSEClientService] ReadyState: ${eventSource.readyState}, CONNECTING: ${EventSource.CONNECTING}, OPEN: ${EventSource.OPEN}, CLOSED: ${EventSource.CLOSED}`);

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
