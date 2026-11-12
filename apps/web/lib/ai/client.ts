import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ParsedBetaMessage } from "@anthropic-ai/sdk/lib/beta-parser";
import type { z } from "zod/v4";
import { HttpError } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";

const MODEL = "claude-opus-5-5";
// USD per million tokens for MODEL; thinking tokens bill as output. Cache writes (5-minute TTL)
// cost 1.25x input; cache reads are billed separately from `input_tokens`.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
const EPHEMERAL = { type: "ephemeral" } as const;

type Content = Anthropic.Beta.Messages.BetaMessageParam["content"];

let client: Anthropic | undefined;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "AI features need ANTHROPIC_API_KEY set on the server");
  }
  client ??= new Anthropic();
  return client;
}

/** USD per web search (web_search tool): $10 per 1,000. */
const SEARCH_PRICE = 0.01;
/** How many times a paused server-tool turn (stop_reason "pause_turn") is resumed. */
const MAX_RESUMES = 2;

type Response = Anthropic.Beta.Messages.BetaMessage;

async function logUsage(userId: string, response: Response) {
  const u = response.usage;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const written = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const cost =
    (u.input_tokens * PRICE.input +
      written * PRICE.cacheWrite +
      read * PRICE.cacheRead +
      u.output_tokens * PRICE.output) /
      1e6 +
    searches * SEARCH_PRICE;
  if (process.env.NODE_ENV !== "production") {
    console.info(`AI usage: ${u.input_tokens} in, ${written} cache write, ${read} cache read, ${u.output_tokens} out`);
  }
  await adminClient().from("ai_usage").insert({
    user_id: userId,
    model: response.model,
    // All input the request processed, cached or not; cost_usd has the real price.
    input_tokens: u.input_tokens + written + read,
    output_tokens: response.usage.output_tokens,
    cost_usd: cost,
  });
}

/**
 * Marks a cache breakpoint at the end of the history before the final user turn. That turn
 * carries fresh per-request context (the planner snapshot), so the next turn reads everything
 * up to here from cache. A breakpoint on the final turn would only ever be written, never read.
 */
function withHistoryBreakpoint(
  input: Anthropic.Beta.Messages.BetaMessageParam[],
): Anthropic.Beta.Messages.BetaMessageParam[] {
  const messages = [...input];
  const i = messages.length - 2;
  const m = messages[i];
  if (!m) return messages;
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] =
    typeof m.content === "string" ? [{ type: "text", text: m.content }] : [...m.content];
  const last = content[content.length - 1];
  if (last?.type !== "text") return messages;
  content[content.length - 1] = { ...last, cache_control: EPHEMERAL };
  messages[i] = { ...m, content };
  return messages;
}

/**
 * One structured-output request to Claude: logs usage and maps refusals, truncation and API
 * errors to user-facing HTTP errors. It does not check limits: callers must call
 * `assertAiAllowed` (lib/ai/limits.ts) once up front, even when they fan out several requests.
 */
export async function runStructured<S extends z.ZodType>(opts: {
  userId: string;
  system: string;
  content: Content;
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  return (await runStructuredWithTools(opts)).output;
}

/**
 * `runStructured` with server tools (e.g. web search). Resumes paused turns, and also returns
 * every content block, so callers can check the output against the tool results.
 */
export async function runStructuredWithTools<S extends z.ZodType>(
  opts: {
    userId: string;
    system: string;
    schema: S;
    effort: "low" | "medium" | "high";
    maxTokens?: number;
    tools?: Anthropic.Beta.Messages.BetaToolUnion[];
  } & (
    | { content: Content }
    /** A whole conversation (starting and ending with a user turn), for chat. */
    | { messages: Anthropic.Beta.Messages.BetaMessageParam[] }
  ),
): Promise<{ output: z.infer<S>; content: Anthropic.Beta.Messages.BetaContentBlock[] }> {
  const api = anthropic();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] =
    "messages" in opts ? withHistoryBreakpoint(opts.messages) : [{ role: "user", content: opts.content }];
  const blocks: Anthropic.Beta.Messages.BetaContentBlock[] = [];
  let response: ParsedBetaMessage<z.infer<S>> | undefined;
  for (let attempt = 0; attempt <= MAX_RESUMES; attempt++) {
    try {
      // Streamed so large outputs (long syllabi) aren't capped by the SDK's non-streaming limit.
      response = await api.beta.messages
        .stream({
          model: MODEL,
          max_tokens: opts.maxTokens ?? 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
          // Tools, output schema and system prompt are fixed per feature, so they cache together.
          system: [{ type: "text", text: opts.system, cache_control: EPHEMERAL }],
          messages,
          ...(opts.tools ? { tools: opts.tools } : {}),
        })
        .finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new HttpError(429, "The AI service is busy. Try again in a minute.");
      }
      if (err instanceof Anthropic.BadRequestError) {
        console.error("Claude rejected the request:", err.message);
        throw new HttpError(
          422,
          "The AI couldn't read that input. Check the file or text and try again.",
        );
      }
      if (err instanceof Anthropic.APIError)
        throw new HttpError(502, "The AI service didn't respond. Try again.");
      throw err;
    }
    await logUsage(opts.userId, response);
    blocks.push(...response.content);
    if (response.stop_reason !== "pause_turn") break;
    // Resume: send the paused turn back as is; the API picks up where it left off.
    messages.push({ role: "assistant", content: response.content });
  }
  response = response!;

  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "The AI declined this request. Try rewording it.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpError(422, "This is too long to process in one go. Try splitting it into parts.");
  }
  if (response.stop_reason === "pause_turn" || !response.parsed_output) {
    throw new HttpError(502, "The AI returned something unexpected. Try again.");
  }
  return { output: response.parsed_output, content: blocks };
}
