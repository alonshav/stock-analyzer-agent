/**
 * Stream Event Payload Types
 * Shared between Agent, SSE Controller, and Telegram Bot
 */

import { StreamEventType } from './enums';

// ============================================================================
// Base Event Properties
// ============================================================================

interface BaseEvent {
  sessionId: string;
  ticker: string;
  timestamp: string;
}

// ============================================================================
// Connection Events
// ============================================================================

export interface ConnectedEvent extends BaseEvent {
  type: StreamEventType.CONNECTED;
  workflowType: string;
}

// ============================================================================
// Content Events
// ============================================================================

export interface ChunkEvent extends BaseEvent {
  type: StreamEventType.CHUNK;
  content: string;
  phase: string;
}

export interface PartialEvent extends BaseEvent {
  type: StreamEventType.PARTIAL;
  partialContent: string;
  deltaType: 'text' | 'thinking' | 'tool_input' | 'unknown';
}

// ============================================================================
// Thinking Events
// ============================================================================

export interface ThinkingEvent extends BaseEvent {
  type: StreamEventType.THINKING;
  message: string;
}

// ============================================================================
// Tool Events
// ============================================================================

export interface ToolEvent extends BaseEvent {
  type: StreamEventType.TOOL;
  toolName: string;
  toolId: string;
  toolInput?: any;
}

export interface ToolResultEvent extends BaseEvent {
  type: StreamEventType.TOOL_RESULT;
  toolId: string;
  toolName?: string;
  toolInput?: any;
}

// ============================================================================
// PDF Events
// ============================================================================

export interface PDFEvent extends BaseEvent {
  type: StreamEventType.PDF;
  pdfBase64: string;
  fileSize: number;
  reportType: 'full' | 'summary';
}

// ============================================================================
// Result Events
// ============================================================================

export interface ResultEvent extends BaseEvent {
  type: StreamEventType.RESULT;
  success: boolean;
  executionTime: number;
  cost: number;
  totalTokens: number;
}

// ============================================================================
// System Events
// ============================================================================

export interface SystemEvent extends BaseEvent {
  type: StreamEventType.SYSTEM;
  model: string;
  permissionMode: string;
}

// ============================================================================
// Compaction Events
// ============================================================================

export interface CompactionEvent extends BaseEvent {
  type: StreamEventType.COMPACTION;
  trigger: string;
  messagesBefore: number;
  messagesAfter: number;
}

// ============================================================================
// Completion Events
// ============================================================================

export interface CompleteEvent extends BaseEvent {
  type: StreamEventType.COMPLETE;
  fullAnalysis?: string;
  executiveSummary?: string;
  metadata: {
    analysisDate: string;
    framework: string;
    model: string;
    duration: number;
  };
}

// ============================================================================
// Error Events
// ============================================================================

export interface ErrorEvent {
  type: StreamEventType.ERROR;
  sessionId?: string;
  message: string;
  timestamp: string;
}

// ============================================================================
// Union Type for All Stream Event Payloads
// ============================================================================

export type StreamEventPayload =
  | ConnectedEvent
  | ChunkEvent
  | PartialEvent
  | ThinkingEvent
  | ToolEvent
  | ToolResultEvent
  | PDFEvent
  | ResultEvent
  | SystemEvent
  | CompactionEvent
  | CompleteEvent
  | ErrorEvent;

// ============================================================================
// Type Guards
// ============================================================================

export function isConnectedEvent(event: StreamEventPayload): event is ConnectedEvent {
  return event.type === StreamEventType.CONNECTED;
}

export function isChunkEvent(event: StreamEventPayload): event is ChunkEvent {
  return event.type === StreamEventType.CHUNK;
}

export function isPartialEvent(event: StreamEventPayload): event is PartialEvent {
  return event.type === StreamEventType.PARTIAL;
}

export function isThinkingEvent(event: StreamEventPayload): event is ThinkingEvent {
  return event.type === StreamEventType.THINKING;
}

export function isToolEvent(event: StreamEventPayload): event is ToolEvent {
  return event.type === StreamEventType.TOOL;
}

export function isToolResultEvent(event: StreamEventPayload): event is ToolResultEvent {
  return event.type === StreamEventType.TOOL_RESULT;
}

export function isPDFEvent(event: StreamEventPayload): event is PDFEvent {
  return event.type === StreamEventType.PDF;
}

export function isResultEvent(event: StreamEventPayload): event is ResultEvent {
  return event.type === StreamEventType.RESULT;
}

export function isSystemEvent(event: StreamEventPayload): event is SystemEvent {
  return event.type === StreamEventType.SYSTEM;
}

export function isCompactionEvent(event: StreamEventPayload): event is CompactionEvent {
  return event.type === StreamEventType.COMPACTION;
}

export function isCompleteEvent(event: StreamEventPayload): event is CompleteEvent {
  return event.type === StreamEventType.COMPLETE;
}

export function isErrorEvent(event: StreamEventPayload): event is ErrorEvent {
  return event.type === StreamEventType.ERROR;
}
