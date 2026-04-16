/**
 * Google AI Studio (Gemini) API client for chat completions.
 * Wraps the Gemini REST API for use with generateContent / streamGenerateContent.
 * Exports chatCompletion() for single-shot requests and chatCompletionStream() for SSE streaming.
 *
 * Replaces the previous Groq/Qwen client (qwen.ts) with the same exported interface.
 */

import type {
  ChatMessage,
  ChatResponse,
  ToolCall,
  ToolDefinition,
} from "@/lib/chat-types";

// ── Constants ───────────────────────────────────────────────────────────────

/** Base URL for the Google AI Studio / Gemini REST API */
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Max automatic retries on 429 / 5xx errors */
const MAX_RETRY_ATTEMPTS = 3;
/** Default wait time when no retry-after header is present */
const DEFAULT_RETRY_AFTER_MS = 5000;
/** Upper bound on retry wait time */
const MAX_RETRY_AFTER_MS = 20000;

// ── Public types & errors ───────────────────────────────────────────────────

/** Options passed to chatCompletion / chatCompletionStream */
export interface ChatCompletionOptions {
  /** Tool/function definitions the model may invoke */
  tools?: ToolDefinition[];
  /** Unused for Gemini — kept for interface compatibility */
  preferSmallModel?: boolean;
  /** Maximum tokens in the model's response */
  maxTokens?: number;
}

/** Thrown when the Gemini API returns 429 (rate limited) */
export class GeminiRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "GeminiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ── Gemini API request/response shapes ──────────────────────────────────────

/** A single part inside a Gemini content message.
 *  thoughtSignature is a sibling of functionCall/text — Gemini 3+ models
 *  attach it to parts and it MUST be echoed back verbatim on subsequent turns. */
interface GeminiPart {
  /** Plain text content */
  text?: string;
  /** A function call requested by the model */
  functionCall?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
  /** A function result sent back to the model */
  functionResponse?: {
    id?: string;
    name: string;
    response: { result: string };
  };
  /** Opaque signature from Gemini 3+ thinking — must be preserved and echoed back. */
  thoughtSignature?: string;
}

/** A single message in the Gemini conversation format */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** System instruction — top-level field, no role */
interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

/** A function declaration inside the tools array */
interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Request body for generateContent / streamGenerateContent */
interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
  toolConfig?: {
    functionCallingConfig: { mode: string };
  };
}

/** A single candidate in the Gemini response */
interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: string;
  };
  finishReason?: string;
}

/** Top-level response from generateContent (non-streaming) */
interface GeminiResponseBody {
  candidates?: GeminiCandidate[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/** A single SSE chunk from streamGenerateContent (same shape as full response) */
type GeminiStreamChunk = GeminiResponseBody;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Simple sleep utility for retry backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Reads and validates the required Google AI Studio environment variables.
 * Throws if either GOOGLE_API_KEY or GOOGLE_MODEL_ID is missing.
 */
function getRequiredGeminiConfig(): { apiKey: string; modelId: string } {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  const modelId = process.env.GOOGLE_MODEL_ID?.trim();

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable.");
  }
  if (!modelId) {
    throw new Error("Missing GOOGLE_MODEL_ID environment variable.");
  }

  return { apiKey, modelId };
}

/**
 * Parses the retry-after delay from a 429 response.
 * Checks the retry-after header first, then falls back to parsing the body.
 */
function parseRetryAfterMs(response: Response, responseText: string): number {
  // Check Retry-After header (seconds)
  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const parsedHeader = Math.ceil(parseFloat(retryAfterHeader) * 1000);
    if (Number.isFinite(parsedHeader) && parsedHeader > 0) {
      return Math.min(parsedHeader, MAX_RETRY_AFTER_MS);
    }
  }

  // Try parsing from response body text
  const retryAfterMatch = responseText.match(/try again in ([\d.]+)s/i);
  if (retryAfterMatch?.[1]) {
    const parsedBody = Math.ceil(parseFloat(retryAfterMatch[1]) * 1000);
    if (Number.isFinite(parsedBody) && parsedBody > 0) {
      return Math.min(parsedBody, MAX_RETRY_AFTER_MS);
    }
  }

  return DEFAULT_RETRY_AFTER_MS;
}

/**
 * Converts our internal ChatMessage format to Gemini's content format.
 * Handles the key mapping differences:
 *   - "system" → extracted separately as systemInstruction (not a content message)
 *   - "assistant" → role "model"
 *   - "tool" → role "user" with functionResponse parts
 *   - "user" → role "user" with text parts
 *   - assistant with toolCalls → role "model" with functionCall parts
 *
 * Returns { systemInstruction, contents } so the caller can place them correctly.
 */
function convertMessages(messages: ChatMessage[]): {
  systemInstruction: GeminiSystemInstruction | undefined;
  contents: GeminiContent[];
} {
  let systemInstruction: GeminiSystemInstruction | undefined;
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    // System messages become the top-level systemInstruction
    if (message.role === "system") {
      systemInstruction = {
        parts: [{ text: message.content }],
      };
      continue;
    }

    // Assistant message with tool calls → model message with functionCall parts
    if (
      message.role === "assistant" &&
      message.toolCalls &&
      message.toolCalls.length > 0
    ) {
      const parts: GeminiPart[] = [];

      // Include any text content the model produced alongside tool calls
      if (message.content) {
        parts.push({ text: message.content });
      }

      // Each tool call becomes a separate functionCall part.
      // thoughtSignature is a part-level sibling — Gemini 3+ requires it echoed back.
      for (const tc of message.toolCalls) {
        parts.push({
          functionCall: {
            id: tc.id,
            name: tc.name,
            args: tc.args,
          },
          ...(tc.thoughtSignature
            ? { thoughtSignature: tc.thoughtSignature }
            : {}),
        });
      }

      contents.push({ role: "model", parts });
      continue;
    }

    // Tool result message → user message with functionResponse part
    if (message.role === "tool" && message.toolResult) {
      // Check if the previous content message is already a "user" with functionResponse
      // parts — if so, merge into it (Gemini wants all tool results in one user message)
      const lastContent = contents[contents.length - 1];
      const functionResponsePart: GeminiPart = {
        functionResponse: {
          id: message.toolResult.toolCallId || message.toolCallId,
          name: message.toolResult.name,
          response: { result: message.toolResult.result },
        },
      };

      if (
        lastContent &&
        lastContent.role === "user" &&
        lastContent.parts.every((p) => p.functionResponse != null)
      ) {
        // Merge into existing functionResponse user message
        lastContent.parts.push(functionResponsePart);
      } else {
        contents.push({
          role: "user",
          parts: [functionResponsePart],
        });
      }
      continue;
    }

    // Plain assistant message → model with text
    if (message.role === "assistant") {
      contents.push({
        role: "model",
        parts: [{ text: message.content }],
      });
      continue;
    }

    // Plain user message → user with text
    contents.push({
      role: "user",
      parts: [{ text: message.content }],
    });
  }

  return { systemInstruction, contents };
}

/**
 * Builds the full request body for the Gemini generateContent endpoint.
 * Converts internal ChatMessage[] to GeminiContent[] and maps ToolDefinition[]
 * to Gemini's functionDeclarations format.
 */
function buildRequestBody(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): GeminiRequestBody {
  const { systemInstruction, contents } = convertMessages(messages);

  if (contents.length === 0) {
    throw new Error("At least one non-system message is required.");
  }

  const body: GeminiRequestBody = {
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: options?.maxTokens ?? 512,
    },
  };

  // Attach system instruction if present
  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  // Attach tool definitions if provided, mapped to Gemini's functionDeclarations format
  if (options?.tools && options.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ];
    body.toolConfig = {
      functionCallingConfig: { mode: "AUTO" },
    };
  }

  return body;
}

/**
 * Makes a fetch request with automatic retry on 429 (rate limited) or 5xx
 * (server error). On 429, reads the retry-after header so we wait long
 * enough before retrying.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  let lastErrorText = "";
  let lastRetryAfterMs = DEFAULT_RETRY_AFTER_MS;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(url, init);

    // Success or client error (not 429) — return immediately
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
      // All retries exhausted on 429
      throw new GeminiRateLimitError(
        `Gemini API rate limited (429): ${lastErrorText}`,
        lastRetryAfterMs
      );
    }

    // 5xx server error — exponential backoff
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      await sleep(
        Math.min(DEFAULT_RETRY_AFTER_MS * (attempt + 1), MAX_RETRY_AFTER_MS)
      );
      continue;
    }

    throw new Error(
      `Gemini API request failed with status ${response.status}: ${lastErrorText}`
    );
  }

  throw new Error(`Gemini API request failed after retries: ${lastErrorText}`);
}

/**
 * Extracts the reply text and any tool calls from a non-streaming Gemini response.
 * In Gemini, tool calls and text are both "parts" inside candidates[0].content.parts.
 */
function extractReplyAndToolCalls(data: GeminiResponseBody): ChatResponse {
  // Check for API-level errors
  if (data.error) {
    throw new Error(
      `Gemini API error (${data.error.code}): ${data.error.message}`
    );
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error("Gemini API returned an empty response (no candidates).");
  }

  const parts = candidate.content?.parts ?? [];

  // Extract text parts (join if multiple)
  const textParts = parts
    .filter((p) => p.text != null)
    .map((p) => p.text!.trim());
  const reply = textParts.join("\n").trim();

  // Extract function call parts — Gemini returns args as already-parsed objects.
  // Preserve thoughtSignature (part-level sibling) so it can be echoed back.
  const toolCalls: ToolCall[] = parts
    .filter((p) => p.functionCall != null)
    .map((p) => ({
      id: p.functionCall!.id ?? `call_${p.functionCall!.name}`,
      name: p.functionCall!.name,
      args: p.functionCall!.args,
      thoughtSignature: p.thoughtSignature,
    }));

  // A response with only tool calls (no text) is valid — the model is
  // requesting function execution. Only throw if both are empty.
  if (!reply && toolCalls.length === 0) {
    throw new Error(
      "Gemini API returned an empty response — no text and no tool calls."
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
 *
 * Note: Gemini streaming does NOT send a "[DONE]" sentinel.
 * The stream ends when the connection closes (ReadableStream done = true).
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

    // Skip empty lines and SSE comments
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
 * Sends a non-streaming generateContent request to the Gemini API.
 * Used for tool-calling rounds where we need the full response at once.
 *
 * @param messages - Conversation history in our internal format
 * @param options  - Optional tool definitions and config
 * @returns ChatResponse with reply text and optional tool calls
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<ChatResponse> {
  const { apiKey, modelId } = getRequiredGeminiConfig();
  const url = `${GEMINI_API_BASE_URL}/models/${modelId}:generateContent`;
  const body = buildRequestBody(messages, options);

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API request failed with status ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as GeminiResponseBody;
  return extractReplyAndToolCalls(data);
}

/**
 * Sends a streaming generateContent request to the Gemini API.
 * Yields text tokens as they arrive via SSE.
 * Used for the final response after all tool calls have been resolved.
 *
 * Uses the streamGenerateContent endpoint with ?alt=sse for SSE format.
 *
 * @param messages - Conversation history in our internal format
 * @param options  - Optional tool definitions (usually omitted for final stream)
 * @yields Individual text tokens as strings
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): AsyncGenerator<string, void, void> {
  const { apiKey, modelId } = getRequiredGeminiConfig();
  // streamGenerateContent with ?alt=sse returns Server-Sent Events
  const url = `${GEMINI_API_BASE_URL}/models/${modelId}:streamGenerateContent?alt=sse`;
  const body = buildRequestBody(messages, options);

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API request failed with status ${response.status}: ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("Gemini API returned a stream without a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        // Parse each SSE chunk — same shape as a full GeminiResponseBody
        const chunk = JSON.parse(event) as GeminiStreamChunk;
        const parts = chunk.candidates?.[0]?.content?.parts;

        if (parts) {
          for (const part of parts) {
            if (part.text) {
              yield part.text;
            }
          }
        }
      }
    }

    // Process any remaining buffer after the stream closes
    if (buffer.trim().length > 0) {
      const { events } = parseSseLines(buffer + "\n");
      for (const event of events) {
        const chunk = JSON.parse(event) as GeminiStreamChunk;
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) {
              yield part.text;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
