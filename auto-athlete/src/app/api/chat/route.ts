import { NextRequest, NextResponse } from "next/server";
import { chatCompletion, chatCompletionStream } from "@/lib/gemini";
import type {
  ChatMessage,
  ChatPageContext,
  ChatRequest,
  ChatRole,
} from "@/lib/chat-types";
import { chatToolDefinitions, executeTool } from "@/lib/chat-tools";
import { buildSystemPrompt } from "@/lib/system-prompt";

const ALLOWED_ROLES: ChatRole[] = ["system", "user", "assistant", "tool"];
const MAX_TOOL_ITERATIONS = 5;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;

  const message = value as Record<string, unknown>;

  return (
    typeof message.content === "string" &&
    typeof message.role === "string" &&
    ALLOWED_ROLES.includes(message.role as ChatRole)
  );
}

function isChatPageContext(value: unknown): value is ChatPageContext {
  if (!value || typeof value !== "object") return false;

  const context = value as Record<string, unknown>;

  return (
    typeof context.page === "string" &&
    (context.playerId == null || typeof context.playerId === "string")
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ChatRequest>;
    const messages = body.messages;
    const context = body.context;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty messages array." },
        { status: 400 }
      );
    }

    if (!messages.every(isChatMessage)) {
      return NextResponse.json(
        { error: "Each message must include a valid role and string content." },
        { status: 400 }
      );
    }

    if (context != null && !isChatPageContext(context)) {
      return NextResponse.json(
        { error: "If provided, context must include a valid page and optional playerId." },
        { status: 400 }
      );
    }

    const systemPrompt = await buildSystemPrompt(context);
    const conversation: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages,
    ];
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        async function run(): Promise<void> {
          try {
            for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
              const response = await chatCompletion(conversation, chatToolDefinitions);
              const toolCalls = response.toolCalls ?? [];

              if (toolCalls.length === 0) {
                break;
              }

              // Preserve the model's function-call turn in history for subsequent tool results.
              conversation.push({
                role: "assistant",
                content: response.reply,
                toolCalls,
              });

              for (const toolCall of toolCalls) {
                const toolResult = await executeTool(toolCall.name, toolCall.args);
                conversation.push({
                  role: "tool",
                  content: toolResult.result,
                  name: toolCall.name,
                  toolCallId: toolCall.id,
                  toolResult: {
                    ...toolResult,
                    toolCallId: toolCall.id ?? toolResult.toolCallId,
                  },
                });
              }

              if (iteration === MAX_TOOL_ITERATIONS - 1) {
                throw new Error("Chat tool loop exceeded the maximum iteration limit.");
              }
            }

            for await (const token of chatCompletionStream(conversation)) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
              );
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unexpected error";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
            );
          } finally {
            controller.close();
          }
        }

        void run();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
