export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  /** Gemini 3+ thought_signature — must be echoed back on functionCall parts. */
  thoughtSignature?: string;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  context?: ChatPageContext;
}

export interface ChatResponse {
  reply: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatPageContext {
  page: string;
  playerId?: string;
}
