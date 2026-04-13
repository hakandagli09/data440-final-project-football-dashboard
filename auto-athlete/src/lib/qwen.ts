/**
 * Groq API client for chat completions (OpenAI-compatible format).
 * Wraps the Groq REST API for use with the Qwen model (or any model hosted on Groq).
 * Exports chatCompletion() for single-shot requests and chatCompletionStream() for SSE streaming.
 */

import type {
  ChatMessage,
  ChatResponse,
  ToolCall,
  ToolDefinition,
} from "@/lib/chat-types";

/** Groq uses the OpenAI-compatible chat completions endpoint */
const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
/** Keep automatic retries bounded to avoid long hangs in the chat UI. */
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_AFTER_MS = 5000;
const MAX_RETRY_AFTER_MS = 20000;

export interface ChatCompletionOptions {
  tools?: ToolDefinition[];
  preferSmallModel?: boolean;
  maxTokens?: number;
}

export class GroqRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "GroqRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ── OpenAI-compatible message types ──────────────────────────────────────────

/** Role values accepted by the Groq/OpenAI chat completions API */
type GroqRole = "system" | "user" | "assistant" | "tool";

/** A single tool/function call returned by the model */
interface GroqToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON-encoded arguments
  };
}

/** A message in the Groq/OpenAI chat completions format */
interface GroqMessage {
  role: GroqRole;
  content: string | null;
  name?: string;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

/** Tool definition in OpenAI function-calling format */
interface GroqTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Request body for Groq chat completions */
interface ChatCompletionRequestBody {
  model: string;
  messages: GroqMessage[];
  tools?: GroqTool[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Controls Qwen 3 thinking/reasoning output visibility. */
  reasoning_format?: "hidden" | "parsed" | "raw";
}

/** Top-level response from a non-streaming chat completion */
interface ChatCompletionResponseBody {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GroqToolCall[];
    };
    finish_reason: string;
  }>;
}

/** A single SSE chunk from a streaming chat completion */
interface ChatCompletionChunk {
  choices: Array<{
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strips Qwen 3 `<think>...</think>` reasoning blocks from model output.
 *  Used as a safety net in case reasoning_format: "hidden" doesn't fully suppress them. */
function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Simple sleep utility for retry backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Reads and validates the required Groq environment variables.
 * Throws if either GROQ_API_KEY or GROQ_MODEL_ID is missing.
 */
function getRequiredGroqConfig(): { apiKey: string; modelId: string } {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const modelId = process.env.GROQ_MODEL_ID?.trim();

  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY environment variable.");
  }

  if (!modelId) {
    throw new Error("Missing GROQ_MODEL_ID environment variable.");
  }

  return { apiKey, modelId };
}

function resolveModelId(
  primaryModelId: string,
  preferSmallModel: boolean = false
): string {
  const fallbackModelId = process.env.GROQ_SIMPLE_MODEL_ID?.trim();
  if (preferSmallModel && fallbackModelId) {
    return fallbackModelId;
  }
  return primaryModelId;
}

function parseRetryAfterMs(response: Response, responseText: string): number {
  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const parsedHeader = Math.ceil(parseFloat(retryAfterHeader) * 1000);
    if (Number.isFinite(parsedHeader) && parsedHeader > 0) {
      return Math.min(parsedHeader, MAX_RETRY_AFTER_MS);
    }
  }

  const retryAfterMatch = responseText.match(/Please try again in ([\d.]+)s/i);
  if (retryAfterMatch?.[1]) {
    const parsedBody = Math.ceil(parseFloat(retryAfterMatch[1]) * 1000);
    if (Number.isFinite(parsedBody) && parsedBody > 0) {
      return Math.min(parsedBody, MAX_RETRY_AFTER_MS);
    }
  }

  return DEFAULT_RETRY_AFTER_MS;
}

/**
 * Converts our internal ChatMessage format to the Groq/OpenAI message format.
 * Handles system, user, assistant (with optional tool_calls), and tool messages.
 */
function convertMessage(message: ChatMessage): GroqMessage {
  // Assistant message that includes tool calls from the model
  if (
    message.role === "assistant" &&
    message.toolCalls &&
    message.toolCalls.length > 0
  ) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((tc, index) => ({
        id: tc.id ?? `call_${index}`,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        },
      })),
    };
  }

  // Tool result message — response to a prior tool call
  if (message.role === "tool" && message.toolResult) {
    return {
      role: "tool",
      content: message.toolResult.result,
      tool_call_id: message.toolResult.toolCallId ?? message.toolCallId ?? "",
    };
  }

  // System, user, or plain assistant messages
  return {
    role: message.role as GroqRole,
    content: message.content,
  };
}

/**
 * Builds the full request body for the Groq chat completions endpoint.
 * Converts internal ChatMessage[] to GroqMessage[] and maps ToolDefinition[]
 * to the OpenAI function-calling tool format.
 */
function buildRequestBody(
  modelId: string,
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
  stream: boolean = false
): ChatCompletionRequestBody {
  const groqMessages: GroqMessage[] = messages.map(convertMessage);

  if (groqMessages.length === 0) {
    throw new Error("At least one message is required.");
  }

  const body: ChatCompletionRequestBody = {
    model: modelId,
    messages: groqMessages,
    temperature: 0.3,
    max_tokens: options?.maxTokens ?? 384,
    stream,
    // Disable Qwen 3's thinking/reasoning output so <think> tags
    // don't leak into the chat UI.
    reasoning_format: "hidden",
  };

  // Attach tool definitions if provided
  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  return body;
}

/**
 * Fetches with a single retry on 429 (rate limited) or 5xx (server error).
 * On 429, reads the Groq `retry-after` header (seconds) so we wait long
 * enough for the TPM window to reset instead of retrying too early.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  let lastErrorText = "";
  let lastRetryAfterMs = DEFAULT_RETRY_AFTER_MS;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 && response.status < 500) {
      return response;
    }

    lastErrorText = await response.text();
    if (response.status === 429) {
      lastRetryAfterMs = parseRetryAfterMs(response, lastErrorText);
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await sleep(lastRetryAfterMs);
        continue;
      }

      throw new GroqRateLimitError(
        `Groq API request failed with status 429: ${lastErrorText}`,
        lastRetryAfterMs
      );
    }

    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      await sleep(Math.min(DEFAULT_RETRY_AFTER_MS * (attempt + 1), MAX_RETRY_AFTER_MS));
      continue;
    }

    throw new Error(
      `Groq API request failed with status ${response.status}: ${lastErrorText}`
    );
  }

  throw new Error(`Groq API request failed after retries: ${lastErrorText}`);
}

/**
 * Extracts the reply text and any tool calls from a non-streaming response.
 */
function extractReplyAndToolCalls(
  data: ChatCompletionResponseBody
): ChatResponse {
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error("Groq API returned an empty response (no choices).");
  }

  const reply = stripThinkingTags(choice.message.content?.trim() ?? "");
  const rawToolCalls = choice.message.tool_calls ?? [];

  // Map Groq tool call format to our internal ToolCall type
  const toolCalls: ToolCall[] = rawToolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  // A response with only tool calls (no text) is valid — the model is
  // requesting function execution. Only throw if both are empty.
  if (!reply && toolCalls.length === 0) {
    throw new Error(
      "Groq API returned an empty response — no text and no tool calls. " +
        "This may indicate a rate limit or model issue."
    );
  }

  return {
    reply,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

/**
 * Parses SSE event lines from a text buffer.
 * Returns parsed event data strings and any remaining incomplete buffer.
 */
function parseSseLines(buffer: string): {
  events: string[];
  remaining: string;
} {
  const lines = buffer.split("\n");
  const events: string[] = [];
  // Keep the last line as remaining (it may be incomplete)
  const remaining = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(":")) {
      continue;
    }

    if (trimmed.startsWith("data: ")) {
      const data = trimmed.slice(6).trim();
      if (data) {
        events.push(data);
      }
    }
  }

  return { events, remaining };
}

// ── Exported API functions ──────────────────────────────────────────────────

/**
 * Sends a non-streaming chat completion request to the Groq API.
 * Used for tool-calling rounds where we need the full response at once.
 *
 * @param messages - Conversation history in our internal format
 * @param tools - Optional tool definitions for function calling
 * @returns ChatResponse with reply text and optional tool calls
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<ChatResponse> {
  const { apiKey, modelId } = getRequiredGroqConfig();
  const url = `${GROQ_API_BASE_URL}/chat/completions`;
  const body = buildRequestBody(
    resolveModelId(modelId, options?.preferSmallModel),
    messages,
    options,
    false
  );

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Groq API request failed with status ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as ChatCompletionResponseBody;
  return extractReplyAndToolCalls(data);
}

/**
 * Sends a streaming chat completion request to the Groq API.
 * Yields text tokens as they arrive via SSE.
 * Used for the final response after all tool calls have been resolved.
 *
 * @param messages - Conversation history in our internal format
 * @param tools - Optional tool definitions (usually omitted for final stream)
 * @yields Individual text tokens as strings
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): AsyncGenerator<string, void, void> {
  const { apiKey, modelId } = getRequiredGroqConfig();
  const url = `${GROQ_API_BASE_URL}/chat/completions`;
  const body = buildRequestBody(
    resolveModelId(modelId, options?.preferSmallModel),
    messages,
    options,
    true
  );

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Groq API request failed with status ${response.status}: ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("Groq API returned a stream without a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Track whether we're inside a <think> block so we can suppress
  // reasoning tokens from the streamed output.
  let insideThink = false;

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSseLines(buffer);
      buffer = remaining;

      for (const event of events) {
        // "[DONE]" signals the end of the stream
        if (event === "[DONE]") {
          return;
        }

        const chunk = JSON.parse(event) as ChatCompletionChunk;
        const delta = chunk.choices?.[0]?.delta;

        if (delta?.content) {
          // Suppress <think>...</think> blocks token-by-token
          let text = delta.content;
          if (text.includes("<think>")) {
            insideThink = true;
          }
          if (insideThink) {
            if (text.includes("</think>")) {
              // Emit only the portion after the closing tag
              text = text.split("</think>").pop() ?? "";
              insideThink = false;
            } else {
              continue; // skip tokens inside thinking block
            }
          }
          if (text) {
            yield text;
          }
        }
      }
    }

    // Process any remaining buffer after the stream closes
    if (buffer.trim().length > 0) {
      const { events } = parseSseLines(buffer + "\n");
      for (const event of events) {
        if (event === "[DONE]") {
          return;
        }
        const chunk = JSON.parse(event) as ChatCompletionChunk;
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          const text = stripThinkingTags(delta.content);
          if (text) {
            yield text;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
