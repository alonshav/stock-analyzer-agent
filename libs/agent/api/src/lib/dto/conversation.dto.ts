/**
 * Conversation API DTOs
 *
 * Bot calls conversation endpoint for freeform chat with context
 */

export interface ConversationMessageDto {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ConversationRequestDto {
  sessionId: string; // Created by Bot's SessionOrchestrator
  userMessage: string; // User's current question/message
  conversationHistory: ConversationMessageDto[]; // Previous messages for context
}
