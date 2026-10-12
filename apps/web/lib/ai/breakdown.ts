import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { ProposedStep } from "@tt/shared";
import { HttpError } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";

const MODEL = "claude-opus-5-5";
// USD per million tokens (input, output) for MODEL; thinking tokens bill as output.
const PRICE = { input: 4, output: 20 };

const Output = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().describe("Short imperative step, e.g. 'Write the analysis section'"),
        estimate_min: z.number().int().describe("Realistic minutes for this step"),
      }),
    )
    .min(3)
    .max(7),
});

const SYSTEM = `You help a busy university student turn a task into concrete steps they can schedule.
Return 3 to 7 steps in the order they'd be done. Each step:
- a short imperative title (under 60 characters) naming a concrete action
- an honest time estimate in minutes, rounded to 5, between 5 and 240

Keep steps the size of one sitting. If the task already has steps, improve on them rather than repeating them.`;

let client: Anthropic | undefined;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "AI breakdown needs ANTHROPIC_API_KEY set on the server");
  }
  client ??= new Anthropic();
  return client;
}

async function assertUnderMonthlyCap(userId: string) {
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

export async function breakDownTask(
  userId: string,
  input: {
    title: string;
    notes: string;
    due_at: string | null;
    list: string | null;
    existingSteps: { title: string; estimate_min: number | null; done: boolean }[];
    mode: "default" | "more_detailed";
    timezone: string;
  },
): Promise<ProposedStep[]> {
  const api = anthropic();
  await assertUnderMonthlyCap(userId);

  const due = input.due_at
    ? new Date(input.due_at).toLocaleString("en-US", {
        timeZone: input.timezone,
        dateStyle: "full",
        timeStyle: "short",
      })
    : "no due date";
  const lines = [
    `Task: ${input.title}`,
    input.list && `List: ${input.list}`,
    `Due: ${due}`,
    input.notes.trim() && `Notes:\n${input.notes.trim()}`,
    input.existingSteps.length &&
      `Current steps:\n${input.existingSteps
        .map(
          (s) =>
            `- ${s.title}${s.estimate_min ? ` (${s.estimate_min} min)` : ""}${s.done ? " [done]" : ""}`,
        )
        .join("\n")}`,
    input.mode === "more_detailed" &&
      "Make the breakdown more detailed: smaller, more specific steps (still at most 7).",
  ].filter(Boolean);

  let response;
  try {
    response = await api.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      system: SYSTEM,
      messages: [{ role: "user", content: lines.join("\n\n") }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError)
      throw new HttpError(429, "The AI service is busy. Try again in a minute.");
    if (err instanceof Anthropic.APIError)
      throw new HttpError(502, "The AI service didn't respond. Try again.");
    throw err;
  }

  const cost =
    (response.usage.input_tokens * PRICE.input + response.usage.output_tokens * PRICE.output) / 1e6;
  await adminClient().from("ai_usage").insert({
    user_id: userId,
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: cost,
  });

  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "This task couldn't be broken down. Try rewording it.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The AI returned something unexpected. Try again.");

  // Normalize: clamp and round estimates, trim titles.
  return parsed.steps.slice(0, 7).map((s) => ({
    title: s.title.trim().slice(0, 200),
    estimate_min: Math.min(480, Math.max(5, Math.round(s.estimate_min / 5) * 5)),
  }));
}
