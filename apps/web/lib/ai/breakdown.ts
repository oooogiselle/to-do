import "server-only";
import { z } from "zod/v4";
import type { ProposedStep } from "@tt/shared";
import { runStructured } from "@/lib/ai/client";
import { assertAiAllowed } from "@/lib/ai/limits";

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

Keep steps the size of one sitting. If the task already has steps, improve on them rather than repeating them.

Someday items have no deadline:
- A long-term goal: steps are milestones in order, spread across its timeframe (e.g. for a half marathon: run 5K without stopping, then 10K, then sign up for a race). Title each as the milestone; the estimate is one sitting of work toward it, not the whole milestone.
- Something to learn: steps are study sessions of 20 to 90 minutes (a chapter, a few videos, a practice exercise, then using it in a small project).
- If only a link's site is given, you don't know what's on the page: keep steps about working through it, and don't invent its contents.`;

const HORIZON: Record<string, string> = { month: "this month", year: "this year", someday: "someday, no rush" };

function somedayLine(i: NonNullable<Parameters<typeof breakDownTask>[1]["someday"]>): string {
  const what =
    i.kind === "goal" ? "a long-term goal" : i.kind === "learn" ? "something to learn" : "an idea for when there's time";
  return [
    `Someday item: ${what}, no deadline.`,
    i.horizon && `Timeframe: ${HORIZON[i.horizon] ?? i.horizon}.`,
    i.site && `Link: a page on ${i.site}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function breakDownTask(
  userId: string,
  input: {
    title: string;
    notes: string;
    due_at: string | null;
    list: string | null;
    /** Set for someday items: goal vs. learn, a rough timeframe and the link's site. */
    someday?: { kind: "goal" | "learn" | null; horizon: string | null; site: string | null } | null;
    existingSteps: { title: string; estimate_min: number | null; done: boolean }[];
    mode: "default" | "more_detailed";
    timezone: string;
  },
): Promise<ProposedStep[]> {
  await assertAiAllowed(userId, "breakdown");

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
    input.someday ? somedayLine(input.someday) : `Due: ${due}`,
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

  const parsed = await runStructured({
    userId,
    system: SYSTEM,
    content: lines.join("\n\n"),
    schema: Output,
    effort: "low",
  });

  // Normalize: clamp and round estimates, trim titles.
  return parsed.steps.slice(0, 7).map((s) => ({
    title: s.title.trim().slice(0, 200),
    estimate_min: Math.min(480, Math.max(5, Math.round(s.estimate_min / 5) * 5)),
  }));
}
