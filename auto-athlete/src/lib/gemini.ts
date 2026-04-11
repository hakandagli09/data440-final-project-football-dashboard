import type {
  ChatMessage,
  ChatResponse,
  ToolCall,
  ToolDefinition,
} from "@/lib/chat-types";

const GOOGLE_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const RETRY_DELAY_MS = 1000;

type GeminiRole = "user" | "model";

interface GeminiContent {
  role?: GeminiRole;
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  functionCall?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

interface GenerateContentRequestBody {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  tools?: GeminiTool[];
  generationConfig?: {
    temperature: number;
    maxOutputTokens: number;
  };
}

interface GenerateContentResponseBody {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRequiredGoogleConfig(): { apiKey: string; modelId: string } {
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

function mapMessageRole(role: ChatMessage["role"]): GeminiRole {
  return role === "assistant" ? "model" : "user";
}

function buildMessageParts(message: ChatMessage): GeminiPart[] {
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return message.toolCalls.map((toolCall) => ({
      functionCall: {
        ...(toolCall.id ? { id: toolCall.id } : {}),
        name: toolCall.name,
        args: toolCall.args,
      },
    }));
  }

  if (message.role === "tool" && message.toolResult) {
    let parsedResponse: Record<string, unknown>;
    try {
      parsedResponse = JSON.parse(message.toolResult.result) as Record<string, unknown>;
    } catch {
      parsedResponse = { result: message.toolResult.result };
    }
    return [
      {
        functionResponse: {
          ...(message.toolResult.toolCallId
            ? { id: message.toolResult.toolCallId }
            : {}),
          name: message.toolResult.name,
          response: parsedResponse,
        },
      },
    ];
  }

  return [{ text: message.content }];
}

function buildRequestBody(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): GenerateContentRequestBody {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: mapMessageRole(message.role),
      parts: buildMessageParts(message),
    }));

  if (contents.length === 0) {
    throw new Error("At least one non-system message is required.");
  }

  return {
    contents,
    ...(systemText
      ? {
          systemInstruction: {
            parts: [{ text: systemText }],
          },
        }
      : {}),
    ...(tools && tools.length > 0
      ? {
          tools: [
            {
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              })),
            },
          ],
        }
      : {}),
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  };
}

function buildGenerateContentUrl(modelId: string): string {
  return `${GOOGLE_API_BASE_URL}/models/${encodeURIComponent(modelId)}:generateContent`;
}

function buildStreamGenerateContentUrl(modelId: string): string {
  return `${GOOGLE_API_BASE_URL}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  const firstResponse = await fetch(url, init);

  if (firstResponse.status !== 429 && firstResponse.status < 500) {
    return firstResponse;
  }

  await sleep(RETRY_DELAY_MS);
  return fetch(url, init);
}

function extractText(parts: GeminiPart[]): string {
  return parts.map((part) => part.text ?? "").join("");
}

function extractReplyAndToolCalls(data: GenerateContentResponseBody): ChatResponse {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const toolCalls: ToolCall[] = [];
  const reply = parts
    .map((part) => {
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.id,
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
        });
      }
      return part.text ?? "";
    })
    .join("")
    .trim();

  if (!reply && toolCalls.length === 0) {
    throw new Error("Google AI API returned an empty response.");
  }

  return {
    reply,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

function parseSseMessages(buffer: string): {
  events: string[];
  remaining: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const segments = normalized.split("\n\n");
  const remaining = segments.pop() ?? "";
  const events = segments
    .map((segment) =>
      segment
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n")
    )
    .filter(Boolean);

  return { events, remaining };
}

export async function chatCompletion(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<ChatResponse> {
  const { apiKey, modelId } = getRequiredGoogleConfig();
  const url = buildGenerateContentUrl(modelId);
  const body = buildRequestBody(messages, tools);

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
      `Google AI API request failed with status ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as GenerateContentResponseBody;
  return extractReplyAndToolCalls(data);
}

export async function* chatCompletionStream(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): AsyncGenerator<string, void, void> {
  const { apiKey, modelId } = getRequiredGoogleConfig();
  const url = buildStreamGenerateContentUrl(modelId);
  const body = buildRequestBody(messages, tools);

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
      `Google AI API request failed with status ${response.status}: ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("Google AI API returned a stream without a body.");
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
      const { events, remaining } = parseSseMessages(buffer);
      buffer = remaining;

      for (const event of events) {
        if (event === "[DONE]") {
          return;
        }

        const data = JSON.parse(event) as GenerateContentResponseBody;
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const text = extractText(parts);

        if (text) {
          yield text;
        }
      }
    }

    if (buffer.trim().length > 0) {
      const event = buffer
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (event && event !== "[DONE]") {
        const data = JSON.parse(event) as GenerateContentResponseBody;
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const text = extractText(parts);
        if (text) {
          yield text;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
