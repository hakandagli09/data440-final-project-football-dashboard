import { NextRequest, NextResponse } from "next/server";
import {
  chatCompletion,
  chatCompletionStream,
  GroqRateLimitError,
} from "@/lib/qwen";
import type {
  ChatMessage,
  ChatPageContext,
  ChatRequest,
  ChatRole,
  ToolDefinition,
} from "@/lib/chat-types";
import { chatToolDefinitions, executeTool } from "@/lib/chat-tools";
import { buildSystemPrompt } from "@/lib/system-prompt";

const ALLOWED_ROLES: ChatRole[] = ["system", "user", "assistant", "tool"];
const MAX_TOOL_ITERATIONS = 4;
/** Max non-system messages to keep in the conversation sent to the LLM.
 *  Keeps token count low enough for Groq free-tier TPM limits. */
const MAX_HISTORY_MESSAGES = 4;
const MAX_MESSAGE_CHARS = 800;

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

function logChatEvent(event: string, details?: Record<string, unknown>): void {
  console.info(`[chat-route] ${event}`, details ?? {});
}

function trimMessageContent(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > MAX_MESSAGE_CHARS
    ? `${trimmed.slice(0, MAX_MESSAGE_CHARS)}...`
    : trimmed;
}

function compactConversation(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    content: trimMessageContent(message.content),
  }));
}

function getLatestUserMessage(messages: ChatMessage[]): string {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return latestUserMessage.toLowerCase();
}

function hasKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function pickToolsForRequest(messages: ChatMessage[], context?: ChatPageContext): ToolDefinition[] {
  const latestUserMessage = getLatestUserMessage(messages);
  const selectedToolNames = new Set<string>(["get_roster_count"]);
  const isCountQuestion = hasKeywords(latestUserMessage, [
    "how many",
    "count",
    "number of",
    "roster",
  ]);
  const isPlayerLookup = hasKeywords(latestUserMessage, [
    "player",
    "athlete",
    "who is",
    "find",
    "lookup",
    "profile",
  ]);
  const isLatestSessionQuestion = hasKeywords(latestUserMessage, [
    "latest session",
    "recent session",
    "most recent session",
    "tracked",
    "today",
    "yesterday",
  ]);
  const isRankingQuestion = hasKeywords(latestUserMessage, [
    "top",
    "leader",
    "highest",
    "lowest",
    "best",
    "most",
  ]);
  const isTeamSummaryQuestion = hasKeywords(latestUserMessage, [
    "average",
    "summary",
    "trend",
    "total",
    "over",
    "between",
    "last 7",
    "last 14",
    "week",
  ]);
  const isPositionReportQuestion = hasKeywords(latestUserMessage, [
    "position",
    "skills",
    "bigs",
    "group",
    "weekly",
    "daily sheet",
    "report",
  ]);
  const isAnalyticsQuestion = hasKeywords(latestUserMessage, [
    "risk",
    "flag",
    "signal",
    "compare",
    "show",
    "list",
    "filter",
    "drill",
  ]);

  if (isCountQuestion) {
    selectedToolNames.add("get_latest_session_player_count");
  }
  if (isPlayerLookup || context?.playerId) {
    selectedToolNames.add("find_player_by_name");
    selectedToolNames.add("get_player_profile");
    selectedToolNames.add("get_players_by_status");
  }
  if (isLatestSessionQuestion) {
    selectedToolNames.add("get_latest_session_summary");
    selectedToolNames.add("get_latest_session_player_count");
    selectedToolNames.add("get_available_session_dates");
  }
  if (isRankingQuestion) {
    selectedToolNames.add("get_top_players_by_metric");
  }
  if (isTeamSummaryQuestion) {
    selectedToolNames.add("get_team_metric_summary");
    selectedToolNames.add("get_dashboard_data");
  }
  if (isPositionReportQuestion) {
    selectedToolNames.add("get_position_report");
    selectedToolNames.add("get_grouped_daily_metrics");
    selectedToolNames.add("get_grouped_weekly_sums");
  }
  if (isAnalyticsQuestion) {
    selectedToolNames.add("query_analytics_view");
  }

  if (selectedToolNames.size <= 2) {
    selectedToolNames.add("get_available_session_dates");
  }

  return chatToolDefinitions.filter((tool) => selectedToolNames.has(tool.name));
}

function shouldPreferSmallModel(messages: ChatMessage[]): boolean {
  const latestUserMessage = getLatestUserMessage(messages);
  const simplePatterns = [
    "how many",
    "count",
    "find ",
    "who is",
    "latest session",
    "most recent",
    "top ",
    "leader",
    "status",
  ];

  return latestUserMessage.length <= 140 && hasKeywords(latestUserMessage, simplePatterns);
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

    logChatEvent("request_received", {
      messageCount: messages.length,
      latestRole: messages[messages.length - 1]?.role ?? null,
      page: context?.page ?? null,
      playerId: context?.playerId ?? null,
    });

    const systemPrompt = await buildSystemPrompt(context);

    // Truncate history to the most recent messages to stay within Groq TPM limits.
    // Always keep the system prompt; only trim user/assistant/tool messages.
    const recentMessages =
      messages.length > MAX_HISTORY_MESSAGES
        ? messages.slice(-MAX_HISTORY_MESSAGES)
        : messages;
    const toolDefinitions = pickToolsForRequest(recentMessages, context);
    const preferSmallModel = shouldPreferSmallModel(recentMessages);

    const conversation: ChatMessage[] = compactConversation([
      {
        role: "system",
        content: systemPrompt,
      },
      ...recentMessages,
    ]);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        async function run(): Promise<void> {
          try {
            // Track whether any tool-call rounds ran. If they did, the final
            // non-streaming chatCompletion already contains the answer — we
            // emit it directly instead of making a second streaming request
            // that would exceed Groq's free-tier TPM window.
            let didRunTools = false;
            let lastReply = "";

            for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
              const response = await chatCompletion(conversation, {
                tools: toolDefinitions,
                preferSmallModel,
                maxTokens: preferSmallModel ? 256 : 384,
              });
              const toolCalls = response.toolCalls ?? [];

              if (toolCalls.length === 0) {
                // No more tool calls — capture the final text answer.
                lastReply = response.reply;
                logChatEvent("final_reply_ready", {
                  iteration,
                  usedTools: didRunTools,
                  replyLength: lastReply.length,
                });
                break;
              }

              didRunTools = true;
              logChatEvent("tool_calls_requested", {
                iteration,
                toolNames: toolCalls.map((toolCall) => toolCall.name),
                toolSchemaCount: toolDefinitions.length,
              });

              // Preserve the model's function-call turn in history for subsequent tool results.
              conversation.push({
                role: "assistant",
                content: response.reply,
                toolCalls,
              });

              for (const toolCall of toolCalls) {
                logChatEvent("tool_execution_start", {
                  iteration,
                  toolName: toolCall.name,
                });
                const toolResult = await executeTool(toolCall.name, toolCall.args);
                logChatEvent("tool_execution_success", {
                  iteration,
                  toolName: toolCall.name,
                  resultLength: toolResult.result.length,
                });
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

            if (didRunTools) {
              // Tools already consumed most of the TPM budget — emit the
              // final reply as a single chunk instead of a second API call.
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token: lastReply })}\n\n`)
              );
            } else {
              // No tools were needed — stream the response token-by-token.
              for await (const token of chatCompletionStream(conversation, {
                preferSmallModel,
                maxTokens: preferSmallModel ? 256 : 384,
              })) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                );
              }
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unexpected error";
            console.error("[chat-route] stream_error", err);
            if (err instanceof GroqRateLimitError) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    error: "Rate limit reached. Retrying shortly may succeed.",
                    rateLimited: true,
                    retryAfterMs: err.retryAfterMs,
                  })}\n\n`
                )
              );
              return;
            }
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
    console.error("[chat-route] request_error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
