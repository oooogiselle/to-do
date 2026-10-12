import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";
import { HttpError } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";

const MODEL = "claude-opus-5-5";
// USD per million tokens (input, output) for MODEL; thinking tokens bill as output.
const PRICE = { input: 4, output: 20 };

type Content = Anthropic.Beta.Messages.BetaMessageParam["content"];

let client: Anthropic | undefined;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "AI features need ANTHROPIC_API_KEY set on the server");
  }
  client ??= new Anthropic();
  return client;
}

export async function assertUnderMonthlyCap(userId: string) {
  const cap = Number(process.env.AI_MONTHLY_CAP_USD || 5);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data, error } = await adminClient()
    .from("ai_usage")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("ts", monthStart.toISOString());
  if (error) throw new Error(error.message);
  const spent = data.reduce((sum, r) => sum + Number(r.cost_usd), 0);
  if (spent >= cap) {
    throw new HttpError(429, `This month's AI budget ($${cap}) is used up. It resets on the 1st.`);
  }
}

/**
 * One structured-output request to Claude: checks the monthly budget, logs usage, and maps
 * refusals, truncation and API errors to user-facing HTTP errors. Callers check the budget
 * once up front (assertUnderMonthlyCap) when they fan out several requests.
 */
export async function runStructured<S extends z.ZodType>(opts: {
  userId: string;
  system: string;
  content: Content;
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const api = anthropic();
  let response;
  try {
    // Streamed so large outputs (long syllabi) aren't capped by the SDK's non-streaming limit.
    response = await api.beta.messages
      .stream({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
        system: opts.system,
        messages: [{ role: "user", content: opts.content }],
      })
      .finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new HttpError(429, "The AI service is busy. Try again in a minute.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new HttpError(
        422,
        "The AI couldn't read that input. Check the file or text and try again.",
      );
    }
    if (err instanceof Anthropic.APIError)
      throw new HttpError(502, "The AI service didn't respond. Try again.");
    throw err;
  }

  const cost =
    (response.usage.input_tokens * PRICE.input + response.usage.output_tokens * PRICE.output) / 1e6;
  await adminClient().from("ai_usage").insert({
    user_id: opts.userId,
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: cost,
  });

  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "The AI declined this request. Try rewording it.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpError(422, "This is too long to process in one go. Try splitting it into parts.");
  }
  if (!response.parsed_output) {
    throw new HttpError(502, "The AI returned something unexpected. Try again.");
  }
  return response.parsed_output as z.infer<S>;
}
