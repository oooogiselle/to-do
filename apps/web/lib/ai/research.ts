import "server-only";
import { z } from "zod/v4";
import {
  verifyResources,
  type AssistantNotes,
  type AssistantType,
  type TaskResearch,
} from "@tt/shared";
import { runStructuredWithTools } from "@/lib/ai/client";
import { RESEARCH_TASK, systemPrompt } from "@/lib/ai/someday/prompts";

/** A web resource, as the model returns it (checked with verifyResources before use). */
export const ResourceOut = z.object({
  title: z.string().describe("The page's real title, shortened if long"),
  url: z.string().describe("Exact URL from a search result"),
  kind: z.enum(["article", "video", "course", "book", "tool", "community", "other"]),
  note: z.string().describe("One short sentence: why this is worth a look"),
  minutes: z
    .number()
    .int()
    .nullable()
    .describe("Rough minutes to get through it (a video's length, a course's hours), else null"),
});

/** The effort estimate, as the model returns it (tidied with tidyEstimate). */
export const EstimateOut = z.object({
  total_min: z
    .number()
    .int()
    .nullable()
    .describe("Total minutes of effort for the whole goal or topic, for a beginner; null only if impossible to say"),
  span: z
    .string()
    .nullable()
    .describe("A few words (under 8) on how that effort spreads out, e.g. 'over about 3 months'"),
  session_min: z.number().int().describe("A typical sitting, in minutes"),
  basis: z.string().describe("One short sentence (under 30 words) on how you reached the estimate"),
});

const Output = EstimateOut.extend({ resources: z.array(ResourceOut).max(6) });

const HORIZON: Record<string, string> = {
  month: "this month",
  year: "this year",
  someday: "someday, no rush",
};

const TYPE_TEXT: Record<AssistantType, string> = {
  goal: "a long-term goal",
  learn: "something to learn",
  idea: "an idea for when there's time",
};

export type ResearchInput = {
  title: string;
  notes: string;
  type: AssistantType;
  horizon: string | null;
  link_url: string | null;
  list: string | null;
  /** The user's notes for the assistant: settings.someday_assistant and the item's own. */
  assistant: { settings: AssistantNotes | null; item: string | null };
};

/** The item's details, as the opening lines of a prompt. */
export function itemLines(input: Omit<ResearchInput, "assistant">): string[] {
  return [
    `Someday item: ${input.title}`,
    `Type: ${TYPE_TEXT[input.type]}.`,
    input.horizon && `Timeframe: ${HORIZON[input.horizon] ?? input.horizon}.`,
    input.list && `List: ${input.list}`,
    input.link_url && `Their link (the main resource): ${input.link_url}`,
    input.notes.trim() && `Notes:\n${input.notes.trim()}`,
  ].filter((l): l is string => !!l);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round5 = (n: number) => Math.round(n / 5) * 5;

/** Tidies a model's effort estimate into TaskResearch's fields. */
export function tidyEstimate(e: {
  total_min: number | null;
  span: string | null;
  session_min: number;
  basis: string;
}): Pick<TaskResearch, "total_min" | "span" | "session_min" | "basis"> {
  return {
    total_min: e.total_min && e.total_min > 0 ? clamp(round5(e.total_min), 15, 2000 * 60) : null,
    span: e.span?.trim().slice(0, 80) || null,
    session_min: clamp(round5(e.session_min), 15, 120),
    basis: e.basis.trim().slice(0, 300) || null,
  };
}

/**
 * Searches the web for resources for a someday item and estimates the effort. Doesn't check
 * limits: the caller calls `assertAiAllowed(userId, "research")` first.
 */
export async function researchIdea(
  userId: string,
  input: ResearchInput,
): Promise<Omit<TaskResearch, "status" | "requested_at">> {
  const { output, content } = await runStructuredWithTools({
    userId,
    system: systemPrompt(input.type, RESEARCH_TASK, input.assistant),
    content: itemLines(input).join("\n\n"),
    schema: Output,
    effort: "medium",
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
  });

  // Only keep links the search actually returned, so a made-up URL never reaches the user.
  const resources = verifyResources(
    output.resources,
    content.filter((b) => b.type !== "text"),
    { skip: [input.link_url], max: 5 },
  );
  return { resources, ...tidyEstimate(output), error: null };
}
